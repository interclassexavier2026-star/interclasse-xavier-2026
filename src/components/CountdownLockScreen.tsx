import React, { useState, useEffect } from 'react';
import { Trophy, Clock, Shield, Sparkles, Flame, Users, Calendar, ArrowRight, Lock } from 'lucide-react';
import { COUNTDOWN_TARGET } from '../utils/constants';

interface CountdownLockScreenProps {
  onAdminLoginClick: () => void;
  onUnlocked: () => void;
}

interface TimeLeft {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  isExpired: boolean;
}

export const CountdownLockScreen: React.FC<CountdownLockScreenProps> = ({
  onAdminLoginClick,
  onUnlocked,
}) => {
  const calculateTimeLeft = (): TimeLeft => {
    const now = new Date().getTime();
    const target = COUNTDOWN_TARGET.getTime();
    const difference = target - now;

    if (difference <= 0) {
      return { days: 0, hours: 0, minutes: 0, seconds: 0, isExpired: true };
    }

    const days = Math.floor(difference / (1000 * 60 * 60 * 24));
    const hours = Math.floor((difference / (1000 * 60 * 60)) % 24);
    const minutes = Math.floor((difference / 1000 / 60) % 60);
    const seconds = Math.floor((difference / 1000) % 60);

    return { days, hours, minutes, seconds, isExpired: false };
  };

  const [timeLeft, setTimeLeft] = useState<TimeLeft>(calculateTimeLeft());

  useEffect(() => {
    const timer = setInterval(() => {
      const updated = calculateTimeLeft();
      setTimeLeft(updated);
      if (updated.isExpired) {
        onUnlocked();
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [onUnlocked]);

  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col justify-between relative overflow-hidden font-sans select-none">
      {/* Dynamic Background Glows */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[700px] h-[500px] bg-sky-600/20 rounded-full blur-[120px] pointer-events-none animate-pulse" />
      <div className="absolute -bottom-20 left-10 w-96 h-96 bg-amber-500/15 rounded-full blur-[100px] pointer-events-none" />
      <div className="absolute top-1/3 right-10 w-80 h-80 bg-indigo-600/15 rounded-full blur-[100px] pointer-events-none" />

      {/* Top Bar with Discreet Admin Access */}
      <header className="relative z-10 max-w-7xl mx-auto w-full px-6 py-6 flex items-center justify-between border-b border-sky-900/40">
        {/* Left Spacer to balance centered title on larger screens */}
        <div className="w-40 hidden sm:block" />

        {/* Center Animated Logo Art */}
        <div className="flex-1 flex justify-center">
          <div className="relative group">
            <div className="absolute -inset-1.5 bg-gradient-to-r from-amber-500 via-sky-400 to-yellow-400 rounded-2xl blur-[14px] opacity-80 animate-pulse"></div>
            <div className="relative px-8 py-3 bg-slate-950/95 border border-slate-800 rounded-2xl leading-none flex items-center shadow-2xl">
              <span className="text-3xl sm:text-5xl md:text-6xl font-black font-display tracking-[0.3em] pl-[0.3em] text-center bg-gradient-to-r from-amber-400 via-sky-300 to-amber-300 bg-clip-text text-transparent animate-pulse drop-shadow-[0_2px_15px_rgba(251,191,36,0.6)] select-none uppercase">
                INTERCLASSE
              </span>
            </div>
          </div>
        </div>

        {/* Right Admin Login Button */}
        <div className="w-40 flex justify-end">
          <button
            onClick={onAdminLoginClick}
            className="flex items-center gap-2 px-4 py-2 bg-slate-900/80 hover:bg-slate-800 text-sky-200 hover:text-amber-300 border border-sky-800/80 hover:border-amber-400/80 rounded-xl text-xs font-bold transition-all shadow-md hover:scale-105 shrink-0"
          >
            <Lock className="w-3.5 h-3.5 text-amber-400" />
            <span>Administração</span>
          </button>
        </div>
      </header>

      {/* Main Countdown Section */}
      <main className="relative z-10 max-w-2xl mx-auto px-4 py-8 flex flex-col items-center my-auto">
        <div className="w-full bg-[#0b1329]/95 border border-slate-800/80 rounded-[32px] p-6 sm:p-10 shadow-[0_20px_50px_rgba(0,0,0,0.5)] flex flex-col items-center text-center space-y-6 sm:space-y-8 relative overflow-hidden">
          {/* Top Pill Indicator */}
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-slate-950/80 border border-slate-800 text-[11px] font-black uppercase tracking-wider text-sky-400">
            <span className="w-2.5 h-2.5 rounded-full bg-blue-500 animate-pulse" />
            <span>CRONÔMETRO DOS JOGOS</span>
          </div>

          {/* Heading */}
          <div className="space-y-3">
            <h1 className="text-3xl sm:text-5xl font-black font-display tracking-tight text-white uppercase leading-none">
              CONTAGEM <span className="text-amber-400 font-black drop-shadow-[0_0_15px_rgba(251,191,36,0.6)]">REGRESSIVA</span>
            </h1>
            <p className="text-xs sm:text-sm text-slate-400 font-medium max-w-md mx-auto leading-relaxed">
              Tabelas de vitórias, confrontos das turmas e resultados ao vivo no apito de início.
            </p>
          </div>

          {/* Countdown Boxes Row */}
          <div className="grid grid-cols-4 gap-2.5 sm:gap-4 w-full">
            {/* Days Box */}
            <div className="bg-[#070d1e]/80 border border-slate-800 rounded-2xl py-4 sm:py-5 flex flex-col items-center justify-center">
              <span className="text-2xl sm:text-4xl font-black font-display text-white tracking-tight">
                {String(timeLeft.days).padStart(2, '0')}
              </span>
              <span className="text-[10px] font-extrabold text-slate-500 tracking-wider mt-1.5 uppercase">
                DIAS
              </span>
            </div>

            {/* Hours Box */}
            <div className="bg-[#070d1e]/80 border border-slate-800 rounded-2xl py-4 sm:py-5 flex flex-col items-center justify-center">
              <span className="text-2xl sm:text-4xl font-black font-display text-white tracking-tight">
                {String(timeLeft.hours).padStart(2, '0')}
              </span>
              <span className="text-[10px] font-extrabold text-slate-500 tracking-wider mt-1.5 uppercase">
                HORAS
              </span>
            </div>

            {/* Minutes Box */}
            <div className="bg-[#070d1e]/80 border border-slate-800 rounded-2xl py-4 sm:py-5 flex flex-col items-center justify-center">
              <span className="text-2xl sm:text-4xl font-black font-display text-white tracking-tight">
                {String(timeLeft.minutes).padStart(2, '0')}
              </span>
              <span className="text-[10px] font-extrabold text-slate-500 tracking-wider mt-1.5 uppercase">
                MIN
              </span>
            </div>

            {/* Seconds Highlighted Box */}
            <div className="bg-[#0c1221]/95 border-2 border-amber-500/80 rounded-2xl py-4 sm:py-5 flex flex-col items-center justify-center shadow-[0_0_15px_rgba(245,158,11,0.15)]">
              <span className="text-2xl sm:text-4xl font-black font-display text-amber-400 tracking-tight drop-shadow-[0_2px_8px_rgba(251,191,36,0.4)]">
                {String(timeLeft.seconds).padStart(2, '0')}
              </span>
              <span className="text-[10px] font-black text-amber-500 tracking-wider mt-1.5 uppercase">
                SEG
              </span>
            </div>
          </div>

          {/* Warning Banner */}
          <div className="w-full bg-[#070c1d]/90 border border-slate-800/80 rounded-2xl p-3 sm:p-4 text-[11px] sm:text-xs leading-relaxed">
            <span className="text-amber-500 font-black uppercase">AVISO DA ORGANIZAÇÃO:</span>{' '}
            <span className="text-slate-300 font-bold">
              O acesso aos chaveamentos e escalação estará liberado em 14/10 à meia-noite (00:00).
            </span>
          </div>
        </div>
      </main>


    </div>
  );
};
