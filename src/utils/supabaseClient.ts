import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Team, Match, ModalityType } from '../types';

// Read client-side environment variables from Vite
const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL || '').trim();
const supabaseAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim();

// Check if valid credentials are provided
export const isSupabaseConfigured = Boolean(
  supabaseUrl &&
  supabaseAnonKey &&
  supabaseUrl.startsWith('https://') &&
  !supabaseUrl.includes('your-supabase-project')
);

// Instantiate Supabase client or null if not configured yet
export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: false },
    })
  : null;

/**
 * Persist teams and matches into Supabase database tables.
 * Supports both relational schema (teams + matches tables) and a JSON state table (tournament_state).
 */
export async function saveTournamentToSupabase(
  teams: Team[],
  matches: Match[]
): Promise<{ success: boolean; error?: string }> {
  if (!supabase || !isSupabaseConfigured) {
    // Graceful offline/local mode when credentials are not configured yet
    return { success: true };
  }

  try {
    const timestamp = new Date().toISOString();

    // 1. Try upserting teams to 'teams' table
    if (teams && teams.length > 0) {
      const teamsPayload = teams.map((t) => ({
        id: t.id,
        name: t.name,
        modality: t.modality,
        captain: t.captain || null,
        shirt_color: t.shirtColor,
        image_url: t.imageUrl && t.imageUrl.length < 100000 ? t.imageUrl : null,
        players: t.players || [],
        player_name: t.playerName || null,
        player_class: t.playerClass || null,
        fouls: t.fouls || 0,
        created_date: t.createdDate || timestamp,
        updated_at: timestamp,
      }));

      const { error: teamsError } = await supabase
        .from('teams')
        .upsert(teamsPayload, { onConflict: 'id' });

      if (teamsError) {
        console.warn('[Supabase] Warning updating teams table:', teamsError.message);
      }
    }

    // 2. Try upserting matches to 'matches' table
    if (matches && matches.length > 0) {
      const matchesPayload = matches.map((m) => ({
        id: m.id,
        modality: m.modality,
        round_name: m.roundName,
        round_index: m.roundIndex,
        match_number: m.matchNumber,
        team_a_id: m.teamAId || null,
        team_b_id: m.teamBId || null,
        team_a_name: m.teamAName || null,
        team_b_name: m.teamBName || null,
        score_a: m.scoreA ?? null,
        score_b: m.scoreB ?? null,
        winner_id: m.winnerId || null,
        loser_id: m.loserId || null,
        date: m.date || null,
        time: m.time || null,
        location: m.location || null,
        next_match_id: m.nextMatchId || null,
        next_match_slot: m.nextMatchSlot || null,
        source_match_a_id: m.sourceMatchAId || null,
        source_match_b_id: m.sourceMatchBId || null,
        source_label_a: m.sourceLabelA || null,
        source_label_b: m.sourceLabelB || null,
        is_bye: Boolean(m.isBye),
        bracket_type: m.bracketType || 'winners',
        is_active: m.isActive ?? true,
        penalty_winner_id: m.penaltyWinnerId || null,
        updated_at: timestamp,
      }));

      const { error: matchesError } = await supabase
        .from('matches')
        .upsert(matchesPayload, { onConflict: 'id' });

      if (matchesError) {
        console.warn('[Supabase] Warning updating matches table:', matchesError.message);
      }
    }

    // 3. Also sync to unified tournament_data / tournaments table if present
    try {
      await supabase.from('tournament_data').upsert(
        {
          id: 'interclasse_2026',
          teams,
          matches,
          last_updated: Date.now(),
        },
        { onConflict: 'id' }
      );
    } catch {
      // Ignore if table does not exist
    }

    return { success: true };
  } catch (err: any) {
    console.warn('[Supabase] Could not sync with Supabase:', err?.message || err);
    return { success: false, error: err?.message };
  }
}

/**
 * Fetch tournament state from Supabase if configured.
 */
export async function fetchTournamentFromSupabase(): Promise<{
  teams: Team[];
  matches: Match[];
  lastUpdated: number;
} | null> {
  if (!supabase || !isSupabaseConfigured) return null;

  try {
    // 1. Try unified document table
    const { data: docData, error: docError } = await supabase
      .from('tournament_data')
      .select('*')
      .eq('id', 'interclasse_2026')
      .maybeSingle();

    if (!docError && docData && Array.isArray(docData.teams) && Array.isArray(docData.matches)) {
      return {
        teams: docData.teams,
        matches: docData.matches,
        lastUpdated: docData.last_updated || Date.now(),
      };
    }

    // 2. Try relational tables
    const [teamsRes, matchesRes] = await Promise.all([
      supabase.from('teams').select('*'),
      supabase.from('matches').select('*'),
    ]);

    if (!teamsRes.error && !matchesRes.error && teamsRes.data && matchesRes.data) {
      if (teamsRes.data.length > 0 || matchesRes.data.length > 0) {
        const mappedTeams: Team[] = teamsRes.data.map((t: any) => ({
          id: t.id,
          name: t.name,
          modality: t.modality,
          captain: t.captain,
          shirtColor: t.shirt_color || '#0284c7',
          imageUrl: t.image_url,
          players: t.players || [],
          playerName: t.player_name,
          playerClass: t.player_class,
          fouls: t.fouls,
          createdDate: t.created_date || new Date().toISOString(),
        }));

        const mappedMatches: Match[] = matchesRes.data.map((m: any) => ({
          id: m.id,
          modality: m.modality,
          roundName: m.round_name,
          roundIndex: m.round_index,
          matchNumber: m.match_number,
          teamAId: m.team_a_id,
          teamBId: m.team_b_id,
          teamAName: m.team_a_name,
          teamBName: m.team_b_name,
          scoreA: m.score_a !== null ? m.score_a : undefined,
          scoreB: m.score_b !== null ? m.score_b : undefined,
          winnerId: m.winner_id,
          loserId: m.loser_id,
          date: m.date,
          time: m.time,
          location: m.location,
          nextMatchId: m.next_match_id,
          nextMatchSlot: m.next_match_slot,
          sourceMatchAId: m.source_match_a_id,
          sourceMatchBId: m.source_match_b_id,
          sourceLabelA: m.source_label_a,
          sourceLabelB: m.source_label_b,
          isBye: m.is_bye,
          bracketType: m.bracket_type,
          isActive: m.is_active,
          penaltyWinnerId: m.penalty_winner_id,
        }));

        return {
          teams: mappedTeams,
          matches: mappedMatches,
          lastUpdated: Date.now(),
        };
      }
    }
  } catch (err) {
    console.warn('[Supabase] Failed to fetch data from Supabase:', err);
  }

  return null;
}

/**
 * Delete / reset matches for a specific modality in Supabase
 */
export async function resetModalityInSupabase(modality: ModalityType): Promise<boolean> {
  if (!supabase || !isSupabaseConfigured) return true;

  try {
    const { error } = await supabase.from('matches').delete().eq('modality', modality);
    if (error) {
      console.warn('[Supabase] Error deleting matches for modality:', error.message);
      return false;
    }
    return true;
  } catch {
    return false;
  }
}
