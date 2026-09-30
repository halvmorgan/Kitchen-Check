import React, { useState, useEffect, useRef } from 'react';
import {
  Upload,
  Camera,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  ShieldCheck,
  Clock,
  Sparkles,
  RefreshCw,
  Phone,
  Mail,
  User,
  ExternalLink,
  ChevronRight,
  FileCheck2,
  Layers,
  Wrench,
  Palette,
  Lightbulb,
  Maximize2
} from 'lucide-react';
import { RoomAnalysisResult, ScreenState, SampleRoom } from './types';
import { processImageFile, processImageUrl } from './utils/imageProcessor';

export const ECENTRA_BOOKING_URL = 'https://api.leadconnectorhq.com/widget/booking/LVpOsNeO7yzeOGttipmW';

const SAMPLE_ROOMS: SampleRoom[] = [
  {
    id: 'sample-oak-kitchen',
    title: 'Sample Kitchen A',
    subtitle: 'Tap to run a test check',
    url: 'https://images.unsplash.com/photo-1556911220-e15b29be8c8f?auto=format&fit=crop&w=700&q=80',
  },
  {
    id: 'sample-tuscan-kitchen',
    title: 'Sample Kitchen B',
    subtitle: 'Tap to run a test check',
    url: 'https://images.unsplash.com/photo-1556912172-45b7abe8b7e1?auto=format&fit=crop&w=700&q=80',
  },
  {
    id: 'sample-dated-bath',
    title: 'Sample Bathroom',
    subtitle: 'Tap to run a test check',
    url: 'https://images.unsplash.com/photo-1584622650111-993a426fbf0a?auto=format&fit=crop&w=700&q=80',
  },
];

const ANALYZING_MESSAGES = [
  'Scanning your space...',
  'Identifying style era...',
  'Checking layout & finishes...',
  'Building your report...',
];

export default function App() {
  const [screen, setScreen] = useState<ScreenState>('hero');
  const [uploadedPhotoUrl, setUploadedPhotoUrl] = useState<string | null>(null);
  const [analysisResult, setAnalysisResult] = useState<RoomAnalysisResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [messageIndex, setMessageIndex] = useState<number>(0);
  const [hiddenSamples, setHiddenSamples] = useState<Set<string>>(new Set());

  // Consultation booking fields (CTA)
  const [leadName, setLeadName] = useState('');
  const [leadPhone, setLeadPhone] = useState('');
  const [leadEmail, setLeadEmail] = useState('');
  const [formErrors, setFormErrors] = useState<{ name?: string; phone?: string; email?: string }>({});

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Rotating status message during analysis
  useEffect(() => {
    if (screen !== 'analyzing') {
      setMessageIndex(0);
      return;
    }
    const interval = setInterval(() => {
      setMessageIndex((prev) => (prev + 1) % ANALYZING_MESSAGES.length);
    }, 1500);
    return () => clearInterval(interval);
  }, [screen]);

  // Animated score counter for report screen
  const [displayScore, setDisplayScore] = useState<number>(0);
  useEffect(() => {
    if (screen === 'report' && analysisResult) {
      setDisplayScore(0);
      const target = analysisResult.score;
      const duration = 1200;
      const start = performance.now();

      const animate = (currentTime: number) => {
        const elapsed = currentTime - start;
        const progress = Math.min(elapsed / duration, 1);
        // Ease-out cubic
        const easeOut = 1 - Math.pow(1 - progress, 3);
        const currentScore = Math.round(target * easeOut);
        setDisplayScore(currentScore);

        if (progress < 1) {
          requestAnimationFrame(animate);
        }
      };

      const animId = requestAnimationFrame(animate);
      return () => cancelAnimationFrame(animId);
    }
  }, [screen, analysisResult]);

  const handleStartAnalysis = async (base64: string, mimeType: string, previewUrl: string) => {
    setUploadedPhotoUrl(previewUrl);
    setErrorMessage(null);
    setScreen('analyzing');
    setIsProcessing(true);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 75000);
    try {
      const response = await fetch('/api/analyze-room', {
        signal: controller.signal,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          base64,
          mimeType,
        }),
      });

      const data = await response.json();

      if (!response.ok || data.error) {
        throw new Error(data.error || 'Failed to complete room check.');
      }

      setAnalysisResult(data);
      setScreen('report');
    } catch (err: unknown) {
      const msg =
        err instanceof Error && err.name === 'AbortError'
          ? 'The room check is busy right now. Please try again in a minute.'
          : err instanceof Error
          ? err.message
          : 'Room check encountered an issue.';
      setErrorMessage(msg);
      setScreen('hero');
    } finally {
      clearTimeout(timeoutId);
      setIsProcessing(false);
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Reset input so same file can be re-selected if desired
    event.target.value = '';

    setErrorMessage(null);
    setIsProcessing(true);

    try {
      const processed = await processImageFile(file);
      await handleStartAnalysis(processed.base64, processed.mimeType, processed.dataUrl);
    } catch (err: unknown) {
      setIsProcessing(false);
      const msg = err instanceof Error ? err.message : 'Error processing image format.';
      setErrorMessage(msg);
      setScreen('hero');
    }
  };

  const handleSampleClick = async (sample: SampleRoom) => {
    setErrorMessage(null);
    setIsProcessing(true);

    try {
      const processed = await processImageUrl(sample.url);
      await handleStartAnalysis(processed.base64, processed.mimeType, processed.dataUrl);
    } catch (err: unknown) {
      setIsProcessing(false);
      const msg = err instanceof Error ? err.message : 'Could not load sample room photo.';
      setErrorMessage(msg);
      setScreen('hero');
    }
  };

  const handleSampleError = (sampleId: string) => {
    setHiddenSamples((prev) => new Set(prev).add(sampleId));
  };

  const handleLeadSubmit = () => {
    const errors: { name?: string; phone?: string; email?: string } = {};

    if (!leadName.trim()) {
      errors.name = 'Please provide your full name.';
    }

    const cleanPhone = leadPhone.replace(/\D/g, '');
    if (cleanPhone.length < 10) {
      errors.phone = 'Please enter a valid 10-digit phone number.';
    }

    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailPattern.test(leadEmail.trim())) {
      errors.email = 'Please enter a valid email address.';
    }

    setFormErrors(errors);

    if (Object.keys(errors).length === 0) {
      // Form submitted successfully, transition to Booked screen
      setScreen('booked');
    }
  };

  const handleReset = () => {
    setScreen('hero');
    setUploadedPhotoUrl(null);
    setAnalysisResult(null);
    setErrorMessage(null);
    setLeadName('');
    setLeadPhone('');
    setLeadEmail('');
    setFormErrors({});
  };

  // Helper for severity badge colors
  const getSeverityStyle = (severity: string) => {
    switch (severity) {
      case 'High':
        return 'bg-red-50 text-red-700 border-red-200';
      case 'Medium':
        return 'bg-amber-50 text-amber-800 border-amber-200';
      case 'Low':
      default:
        return 'bg-emerald-50 text-emerald-800 border-emerald-200';
    }
  };

  // Helper for score badge colors
  const getScoreTheme = (score: number) => {
    if (score >= 70) {
      return {
        stroke: '#16A34A',
        bgPill: 'bg-emerald-50 text-emerald-800 border-emerald-200',
        textAccent: 'text-emerald-700',
        summaryLabel: 'Modern & Current',
      };
    }
    if (score >= 40) {
      return {
        stroke: '#D97706',
        bgPill: 'bg-amber-50 text-amber-800 border-amber-200',
        textAccent: 'text-amber-700',
        summaryLabel: 'Showing Its Age',
      };
    }
    return {
      stroke: '#DC2626',
      bgPill: 'bg-red-50 text-red-800 border-red-200',
      textAccent: 'text-red-700',
      summaryLabel: 'Prime For Remodel',
    };
  };

  // SVG circle calculation
  const circleRadius = 56;
  const circumference = 2 * Math.PI * circleRadius;
  const strokeDashoffset = circumference - (displayScore / 100) * circumference;
  const scoreTheme = getScoreTheme(displayScore);

  return (
    <div className="min-h-screen bg-[#FAF8F5] text-[#24211E] flex flex-col font-sans selection:bg-[#B8683D]/20 selection:text-[#B8683D]">
      {/* 1. Dark full-width live demo banner */}
      <div className="w-full bg-[#181513] text-[#FAF8F5] py-2.5 px-4 text-xs sm:text-sm font-medium border-b border-[#2C2723] shadow-inner">
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="inline-block w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse shrink-0" />
            <span className="font-semibold tracking-wide text-white">LIVE DEMO</span>
            <span className="text-[#A8A199] hidden sm:inline">—</span>
            <span className="text-[#C8C2BA] text-xs sm:text-sm">
              This tool was built for <strong className="text-white font-semibold">YOUR remodeling company</strong>. Your name, your branding, your calendar.
            </span>
          </div>
          <a
            href={ECENTRA_BOOKING_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="hidden md:inline-flex items-center gap-1.5 text-xs text-[#E59866] hover:text-white transition-colors shrink-0 underline decoration-[#B8683D]/60 underline-offset-4"
          >
            Claim This For Your Site <ArrowRight className="w-3.5 h-3.5" />
          </a>
        </div>
      </div>

      {/* Header with prospect placeholder branding */}
      <header className="border-b border-[#EDE6DC] bg-white/80 backdrop-blur-md sticky top-0 z-30">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-18 flex items-center justify-between">
          {/* Dashed-border logo placeholder */}
          <div className="flex items-center gap-3">
            <div className="border-2 border-dashed border-[#B8683D]/50 bg-[#FDF9F5] px-3.5 py-1.5 rounded-md text-xs sm:text-sm font-medium tracking-wide text-[#7C4828] select-none hover:border-[#B8683D] transition-colors">
              [ Your Business Name Here ]
            </div>
            <span className="hidden sm:inline-block text-xs text-[#857B72] tracking-wider uppercase font-medium">
              Remodeling & General Contracting
            </span>
          </div>

          <div className="flex items-center gap-4">
            <span className="text-xs text-[#857B72] hidden lg:inline">
              Instant Room Assessment Demo
            </span>
            <a
              href={ECENTRA_BOOKING_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs font-medium px-3.5 py-2 rounded-md bg-[#FAF8F5] hover:bg-[#F3ECE1] border border-[#DDD4C7] text-[#3D3732] transition-colors flex items-center gap-1.5"
            >
              <span>Agency Consultation</span>
              <ExternalLink className="w-3.5 h-3.5 text-[#B8683D]" />
            </a>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-6 py-8 sm:py-12">
        {/* ==================== SCREEN 1: HERO ==================== */}
        {screen === 'hero' && (
          <div className="flex flex-col items-center text-center max-w-3xl mx-auto">
            {/* Error Message Box if previous check failed */}
            {errorMessage && (
              <div className="w-full mb-8 text-left bg-red-50 border border-red-200 rounded-xl p-5 shadow-sm animate-in fade-in duration-300">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <p className="text-sm font-semibold text-red-900">Room Analysis Notice</p>
                    <p className="text-sm text-red-700">{errorMessage}</p>
                    <p className="text-xs font-medium text-red-800 pt-1">
                      Tap the button and try again.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Badge */}
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#F5ECE4] border border-[#E4D1C3] text-[#934E27] text-xs font-semibold tracking-wider uppercase mb-5">
              <Sparkles className="w-3.5 h-3.5 text-[#B8683D]" />
              <span>Instant Room Style & Condition Scan</span>
            </div>

            {/* Main Headline */}
            <h1 className="font-display text-4xl sm:text-5xl lg:text-6xl text-[#1E1B18] font-bold tracking-tight leading-[1.15] mb-5">
              How Dated Is Your Kitchen, Really?
            </h1>

            {/* Paragraph */}
            <p className="text-base sm:text-lg text-[#5E564E] leading-relaxed max-w-2xl mb-8">
              A free, instant read on how dated your kitchen or bathroom looks, what's working, what buyers may notice, and a remodel price range — no obligation.
            </p>

            {/* Upload Button Area */}
            <div className="w-full max-w-md mx-auto mb-4">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,.heic,.heif"
                onChange={handleFileUpload}
                className="hidden"
                id="room-photo-input"
                disabled={isProcessing}
              />

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isProcessing}
                className="w-full group cursor-pointer relative overflow-hidden bg-gradient-to-b from-[#C47244] to-[#B8683D] hover:from-[#B8683D] hover:to-[#A8582F] text-white font-medium py-4 px-6 rounded-xl shadow-lg hover:shadow-xl transition-all duration-200 transform active:scale-[0.99] flex items-center justify-center gap-3 border border-[#D5855A]"
              >
                <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                  <Camera className="w-5 h-5 text-white" />
                </div>
                <div className="text-left">
                  <div className="text-base sm:text-lg font-semibold tracking-wide">
                    {isProcessing ? 'Processing Room Photo...' : 'Upload Room Photo'}
                  </div>
                  <div className="text-xs text-white/80 font-normal">
                    Kitchen or bathroom · Tap to take or choose photo
                  </div>
                </div>
                <ArrowRight className="w-5 h-5 text-white/80 ml-auto group-hover:translate-x-1 transition-transform" />
              </button>
            </div>

            {/* Trust line */}
            <div className="flex items-center justify-center gap-2 text-xs sm:text-sm text-[#7D7368] mb-10">
              <ShieldCheck className="w-4 h-4 text-[#B8683D]" />
              <span>Takes 30 seconds · No obligation · Your photo is never stored</span>
            </div>

            {/* 3-Step "How It Works" Row */}
            <div className="w-full max-w-3xl border border-[#E9E1D6] bg-white rounded-2xl p-6 sm:p-7 shadow-xs mb-12">
              <div className="text-xs uppercase tracking-widest font-semibold text-[#8C8074] mb-5 text-left">
                How It Works
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-left">
                <div className="flex items-start gap-3.5">
                  <div className="w-8 h-8 rounded-full bg-[#F6EFE8] text-[#B8683D] flex items-center justify-center font-bold text-sm shrink-0 border border-[#E8DACD]">
                    1
                  </div>
                  <div>
                    <h2 className="text-sm font-semibold text-[#24211E] mb-1">
                      Upload a photo of your room
                    </h2>
                    <p className="text-xs text-[#6F665C] leading-normal">
                      Snap a quick wide angle of your kitchen or bathroom from any phone or tablet.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3.5">
                  <div className="w-8 h-8 rounded-full bg-[#F6EFE8] text-[#B8683D] flex items-center justify-center font-bold text-sm shrink-0 border border-[#E8DACD]">
                    2
                  </div>
                  <div>
                    <h2 className="text-sm font-semibold text-[#24211E] mb-1">
                      We analyze the style & condition
                    </h2>
                    <p className="text-xs text-[#6F665C] leading-normal">
                      Our system checks cabinetry eras, layout flow, surface wear, and buyer appeal.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3.5">
                  <div className="w-8 h-8 rounded-full bg-[#F6EFE8] text-[#B8683D] flex items-center justify-center font-bold text-sm shrink-0 border border-[#E8DACD]">
                    3
                  </div>
                  <div>
                    <h2 className="text-sm font-semibold text-[#24211E] mb-1">
                      Get your free report
                    </h2>
                    <p className="text-xs text-[#6F665C] leading-normal">
                      Review your modern score, pinpointed findings, and realistic remodel price ballpark.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Desktop Sample Rooms for testing */}
            <div className="w-full max-w-3xl text-left border-t border-[#EAE3D8] pt-8">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-sm font-semibold text-[#2B2723]">
                    No photo handy? Try a sample room
                  </h2>
                  <p className="text-xs text-[#7D7368]">
                    Click any sample room below to test the instant check without uploading:
                  </p>
                </div>
                <span className="text-xs text-[#B8683D] font-medium hidden sm:inline">
                  1-Click Instant Check
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {SAMPLE_ROOMS.filter((s) => !hiddenSamples.has(s.id)).map((sample) => (
                  <button
                    key={sample.id}
                    type="button"
                    onClick={() => handleSampleClick(sample)}
                    disabled={isProcessing}
                    className="group cursor-pointer text-left bg-white border border-[#E5DDD2] rounded-xl overflow-hidden shadow-xs hover:border-[#B8683D] hover:shadow-md transition-all duration-200"
                  >
                    <div className="relative h-32 w-full bg-[#F0EBE3] overflow-hidden">
                      <img
                        src={sample.url}
                        alt={sample.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        crossOrigin="anonymous"
                        onError={() => handleSampleError(sample.id)}
                      />
                      <div className="absolute inset-0 bg-black/10 group-hover:bg-transparent transition-colors" />
                      <div className="absolute bottom-2 right-2 bg-black/70 text-white text-[10px] font-medium px-2 py-0.5 rounded backdrop-blur-xs">
                        Click to check
                      </div>
                    </div>
                    <div className="p-3">
                      <div className="text-xs font-semibold text-[#292522] group-hover:text-[#B8683D] transition-colors truncate">
                        {sample.title}
                      </div>
                      <div className="text-[11px] text-[#7A7167] truncate mt-0.5">
                        {sample.subtitle}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ==================== SCREEN 2: ANALYZING ==================== */}
        {screen === 'analyzing' && (
          <div className="flex flex-col items-center text-center max-w-lg mx-auto py-8 sm:py-16">
            {/* Photo frame with pulsing copper ring */}
            <div className="relative mb-8">
              <div className="w-52 h-52 sm:w-64 sm:h-64 rounded-2xl overflow-hidden border-4 border-[#B8683D] shadow-2xl relative animate-pulse-copper">
                {uploadedPhotoUrl ? (
                  <img
                    src={uploadedPhotoUrl}
                    alt="Space being analyzed"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full bg-[#EFE9DF] flex items-center justify-center">
                    <Camera className="w-12 h-12 text-[#9B8F82]" />
                  </div>
                )}
                {/* Scanner sweep line */}
                <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[#B8683D]/25 to-transparent h-16 w-full animate-bounce opacity-80" />
              </div>
            </div>

            {/* Status updates rotating every ~1.5s */}
            <div className="space-y-3">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#F5ECE4] text-[#B8683D] text-xs font-semibold uppercase tracking-wider">
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                <span>Automated Room Inspection</span>
              </div>

              <h2 className="text-2xl sm:text-3xl font-display font-semibold text-[#1F1C19] min-h-[40px] transition-all duration-300">
                {ANALYZING_MESSAGES[messageIndex]}
              </h2>

              <p className="text-sm text-[#7D7368] max-w-sm">
                Examining visible surfaces, layout proportions, cabinetry style, and modern design standards...
              </p>
            </div>
          </div>
        )}

        {/* ==================== SCREEN 3: REPORT ==================== */}
        {screen === 'report' && analysisResult && (
          <div className="space-y-8 max-w-4xl mx-auto animate-in fade-in duration-300">
            {/* Top overview card */}
            <div className="bg-white border border-[#EBE4D8] rounded-2xl p-6 sm:p-8 shadow-xs">
              <div className="flex flex-col lg:flex-row items-center justify-between gap-8">
                {/* Left: Score Gauge */}
                <div className="flex items-center gap-6">
                  <div className="relative flex items-center justify-center shrink-0">
                    <svg className="w-36 h-36 transform -rotate-90">
                      {/* Background circle */}
                      <circle
                        cx="72"
                        cy="72"
                        r={circleRadius}
                        stroke="#EDE6DC"
                        strokeWidth="10"
                        fill="transparent"
                      />
                      {/* Animated Progress circle */}
                      <circle
                        cx="72"
                        cy="72"
                        r={circleRadius}
                        stroke={scoreTheme.stroke}
                        strokeWidth="10"
                        fill="transparent"
                        strokeDasharray={circumference}
                        strokeDashoffset={strokeDashoffset}
                        strokeLinecap="round"
                        className="transition-all duration-300 ease-out"
                      />
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                      <span className="text-4xl font-display font-bold text-[#1E1B18] tracking-tight">
                        {displayScore}
                      </span>
                      <span className="text-[10px] uppercase tracking-wider font-semibold text-[#877E75]">
                        Modern Score
                      </span>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`text-xs font-semibold px-3 py-1 rounded-full border ${scoreTheme.bgPill}`}
                      >
                        {analysisResult.verdict}
                      </span>
                      <span className="text-xs font-medium px-3 py-1 rounded-full bg-[#F5F1EB] text-[#554E46] border border-[#E3DCD1]">
                        {analysisResult.roomType} • {analysisResult.styleEra}
                      </span>
                    </div>
                    <h2 className="text-xl sm:text-2xl font-display font-bold text-[#1E1B18]">
                      Room Style & Era Assessment
                    </h2>
                    <p className="text-xs sm:text-sm text-[#6C6359] max-w-md">
                      Based on visible architectural details, cabinet profile, countertops, and fixture styles.
                    </p>
                  </div>
                </div>

                {/* Right: Analyzed photo preview */}
                {uploadedPhotoUrl && (
                  <div className="relative rounded-xl overflow-hidden border border-[#E0D8CB] w-36 h-28 sm:w-44 sm:h-32 shrink-0 shadow-xs">
                    <img
                      src={uploadedPhotoUrl}
                      alt="Room analyzed"
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute bottom-1.5 left-1.5 bg-[#181513]/80 backdrop-blur-xs text-white text-[10px] font-medium px-2 py-0.5 rounded">
                      Analyzed Space
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* 3 Key Findings Cards */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-base sm:text-lg font-display font-bold text-[#1F1C19]">
                  Design & Condition Findings
                </h2>
                <span className="text-xs text-[#877E75]">3 Key Areas Observed</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {analysisResult.findings.slice(0, 3).map((finding, idx) => (
                  <div
                    key={idx}
                    className="bg-white border border-[#E8E1D5] rounded-xl p-5 shadow-xs flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2 mb-2.5">
                        <span className="text-[11px] font-semibold uppercase tracking-wider text-[#8A7F73]">
                          {finding.category}
                        </span>
                        <span
                          className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${getSeverityStyle(
                            finding.severity
                          )}`}
                        >
                          {finding.severity} Priority
                        </span>
                      </div>
                      <h3 className="text-sm font-semibold text-[#211E1B] mb-2 leading-snug">
                        {finding.title}
                      </h3>
                      <p className="text-xs text-[#635A50] leading-relaxed">
                        {finding.detail}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Two columns: Good News vs Watch Out For */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {/* Positives */}
              <div className="bg-white border border-[#E3ECD9] rounded-xl p-5 shadow-xs">
                <div className="flex items-center gap-2 mb-3.5 text-emerald-800 font-semibold text-sm">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>Good News & What Works</span>
                </div>
                <ul className="space-y-2.5">
                  {analysisResult.positives.map((pos, idx) => (
                    <li key={idx} className="flex items-start gap-2.5 text-xs text-[#4A433B] leading-relaxed">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 shrink-0 mt-1.5" />
                      <span>{pos}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Concerns */}
              <div className="bg-white border border-[#F2E8DC] rounded-xl p-5 shadow-xs">
                <div className="flex items-center gap-2 mb-3.5 text-amber-900 font-semibold text-sm">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                  <span>Watch Out For & Buyer Notices</span>
                </div>
                <ul className="space-y-2.5">
                  {analysisResult.concerns.map((con, idx) => (
                    <li key={idx} className="flex items-start gap-2.5 text-xs text-[#4A433B] leading-relaxed">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-600 shrink-0 mt-1.5" />
                      <span>{con}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* Dark Bottom Line Section */}
            <div className="bg-[#181513] text-[#FAF8F5] rounded-2xl p-6 sm:p-8 shadow-xl border border-[#2B2724]">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div className="space-y-2 max-w-xl">
                  <div className="inline-flex items-center gap-1.5 text-xs text-[#D97D4B] font-semibold uppercase tracking-wider">
                    <FileCheck2 className="w-3.5 h-3.5 text-[#B8683D]" />
                    <span>The Bottom Line</span>
                  </div>
                  <p className="text-sm sm:text-base text-[#DDD7CF] leading-relaxed font-normal">
                    {analysisResult.bottomLine}
                  </p>
                  <p className="text-[11px] text-[#9E958A] pt-1">
                    Estimates only. Your free in-home consultation gives exact design options and pricing.
                  </p>
                </div>

                <div className="bg-[#24201D] border border-[#3A332E] rounded-xl p-5 text-center shrink-0 min-w-[240px]">
                  <span className="text-[11px] uppercase tracking-wider text-[#A69D92] font-medium block mb-1">
                    Remodel Price Ballpark
                  </span>
                  <div className="font-display text-2xl sm:text-3xl font-bold text-[#E59866] tracking-tight">
                    {analysisResult.costRange}
                  </div>
                  <span className="text-xs text-[#BDB5AB] mt-1 block">
                    {analysisResult.costNote}
                  </span>
                </div>
              </div>
            </div>

            {/* Consultation Booking CTA Box */}
            <div className="bg-gradient-to-br from-white to-[#FDFBF7] border-2 border-[#B8683D]/40 rounded-2xl p-6 sm:p-9 shadow-lg">
              <div className="max-w-2xl mx-auto">
                <div className="text-center mb-6">
                  <div className="inline-block px-3 py-1 rounded-full bg-[#F7ECE3] text-[#A65527] text-xs font-semibold uppercase tracking-wider mb-2">
                    Free In-Home Consultation
                  </div>
                  <h2 className="text-2xl sm:text-3xl font-display font-bold text-[#1E1B18] mb-2">
                    Want the exact answer — free?
                  </h2>
                  <p className="text-xs sm:text-sm text-[#6C6359]">
                    Have an experienced designer visit your home, review your space in person, and deliver a zero-obligation custom estimate.
                  </p>
                </div>

                {/* 3 Checkmark Benefits */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-8 bg-[#FAF6F0] p-4 rounded-xl border border-[#EDE5DA]">
                  <div className="flex items-center gap-2 text-xs font-medium text-[#38322D]">
                    <CheckCircle2 className="w-4 h-4 text-[#B8683D] shrink-0" />
                    <span>Design ideas for your space</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs font-medium text-[#38322D]">
                    <CheckCircle2 className="w-4 h-4 text-[#B8683D] shrink-0" />
                    <span>An exact estimate, no surprises</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs font-medium text-[#38322D]">
                    <CheckCircle2 className="w-4 h-4 text-[#B8683D] shrink-0" />
                    <span>No-pressure, no-obligation visit</span>
                  </div>
                </div>

                {/* Lead Form Inputs (NO form tags, pure onClick) */}
                <div className="space-y-4 mb-5">
                  <div>
                    <label className="block text-xs font-semibold text-[#423C35] mb-1.5">
                      Your Full Name *
                    </label>
                    <div className="relative">
                      <User className="w-4 h-4 text-[#998F84] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        type="text"
                        value={leadName}
                        onChange={(e) => setLeadName(e.target.value)}
                        placeholder="Sarah Jenkins"
                        className={`w-full pl-10 pr-3.5 py-3 rounded-lg border bg-white text-sm text-[#1F1C19] placeholder:text-[#AAA297] focus:outline-none focus:ring-2 focus:ring-[#B8683D] ${
                          formErrors.name ? 'border-red-400 bg-red-50/20' : 'border-[#D9D1C5]'
                        }`}
                      />
                    </div>
                    {formErrors.name && (
                      <p className="text-xs text-red-600 mt-1">{formErrors.name}</p>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-[#423C35] mb-1.5">
                        Phone Number *
                      </label>
                      <div className="relative">
                        <Phone className="w-4 h-4 text-[#998F84] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                        <input
                          type="tel"
                          value={leadPhone}
                          onChange={(e) => setLeadPhone(e.target.value)}
                          placeholder="(555) 234-5678"
                          className={`w-full pl-10 pr-3.5 py-3 rounded-lg border bg-white text-sm text-[#1F1C19] placeholder:text-[#AAA297] focus:outline-none focus:ring-2 focus:ring-[#B8683D] ${
                            formErrors.phone ? 'border-red-400 bg-red-50/20' : 'border-[#D9D1C5]'
                          }`}
                        />
                      </div>
                      {formErrors.phone && (
                        <p className="text-xs text-red-600 mt-1">{formErrors.phone}</p>
                      )}
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-[#423C35] mb-1.5">
                        Email Address *
                      </label>
                      <div className="relative">
                        <Mail className="w-4 h-4 text-[#998F84] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                        <input
                          type="email"
                          value={leadEmail}
                          onChange={(e) => setLeadEmail(e.target.value)}
                          placeholder="sarah@example.com"
                          className={`w-full pl-10 pr-3.5 py-3 rounded-lg border bg-white text-sm text-[#1F1C19] placeholder:text-[#AAA297] focus:outline-none focus:ring-2 focus:ring-[#B8683D] ${
                            formErrors.email ? 'border-red-400 bg-red-50/20' : 'border-[#D9D1C5]'
                          }`}
                        />
                      </div>
                      {formErrors.email && (
                        <p className="text-xs text-red-600 mt-1">{formErrors.email}</p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Consent text */}
                <p className="text-[11px] text-[#7A7167] leading-normal mb-5 text-center">
                  By tapping the button below, you agree that [ Your Business Name Here ] may call, text, or email you about your consultation. Message and data rates may apply. Reply STOP to opt out. Consent is not a condition of purchase.
                </p>

                {/* Submit button */}
                <button
                  type="button"
                  onClick={handleLeadSubmit}
                  className="w-full cursor-pointer bg-[#B8683D] hover:bg-[#A3582E] text-white font-medium py-4 px-6 rounded-xl shadow-md hover:shadow-lg transition-all duration-200 text-base sm:text-lg flex items-center justify-center gap-2 font-semibold"
                >
                  <span>Book My Free Design Consultation</span>
                  <ArrowRight className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Back to Hero / Run another button */}
            <div className="text-center pt-2">
              <button
                type="button"
                onClick={handleReset}
                className="text-xs font-medium text-[#7D7368] hover:text-[#B8683D] transition-colors underline decoration-[#DDD4C7] underline-offset-4 cursor-pointer"
              >
                Scan another room photo
              </button>
            </div>
          </div>
        )}

        {/* ==================== SCREEN 4: BOOKED ==================== */}
        {screen === 'booked' && (
          <div className="max-w-2xl mx-auto py-8 sm:py-16 text-center animate-in zoom-in-95 duration-300">
            {/* Big Success Check Animation */}
            <div className="w-20 h-20 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto mb-6 shadow-md border-2 border-emerald-200">
              <CheckCircle2 className="w-10 h-10" />
            </div>

            {/* Demo Notice for the Remodeling Company Owner */}
            <div className="inline-block px-3.5 py-1 rounded-full bg-[#181513] text-[#FAF8F5] text-xs font-semibold tracking-wider uppercase mb-5">
              Prospect Demo Walkthrough
            </div>

            <h2 className="text-2xl sm:text-3xl lg:text-4xl font-display font-bold text-[#1E1B18] leading-tight mb-4">
              In the live version, this homeowner's name, phone, email and room report come straight to YOU — ready for you to book the in-home design consult.
            </h2>

            <p className="text-base text-[#5E564E] leading-relaxed mb-8 max-w-xl mx-auto">
              Want this activated for your business? Book a 15-minute setup call with Ecentra Concierge below — we'll set it up on your site, branded to your business.
            </p>

            {/* Large Book Setup Call Button */}
            <div className="max-w-md mx-auto mb-6">
              <a
                href={ECENTRA_BOOKING_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full inline-flex items-center justify-center gap-3 bg-[#B8683D] hover:bg-[#A3582E] text-white font-semibold py-4 px-6 rounded-xl shadow-lg hover:shadow-xl transition-all duration-200 text-base sm:text-lg group"
              >
                <span>Book Your Setup Call</span>
                <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </a>
            </div>

            <p className="text-xs text-[#877E75] mb-8">
              Done-for-you setup. Your name, your branding, your leads.
            </p>

            {/* Run another analysis secondary button */}
            <div>
              <button
                type="button"
                onClick={handleReset}
                className="cursor-pointer inline-flex items-center gap-2 text-xs font-semibold text-[#5A524A] hover:text-[#B8683D] bg-white border border-[#E0D7CB] hover:border-[#B8683D] px-5 py-2.5 rounded-lg shadow-xs transition-all"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Run another analysis</span>
              </button>
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-[#EDE6DC] bg-white py-6 px-4 text-center text-xs text-[#8F857B]">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-[#423C35]">[ Your Business Name Here ]</span>
            <span>·</span>
            <span>Kitchen & Bath Remodeling</span>
          </div>
          <div>
            <a
              href={ECENTRA_BOOKING_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#B8683D] hover:underline font-medium"
            >
              Demo provided by Ecentra Concierge
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
