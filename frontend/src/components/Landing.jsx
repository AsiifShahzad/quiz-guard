/**
 * Landing Page — ExamGuard
 *
 * Bold, professional landing page for the AI-proctored quiz platform.
 * Features: hero section, feature cards, how-it-works steps, stats, CTA.
 */

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Shield, Eye, Brain, Zap, ChevronRight, X,
    Camera, AlertTriangle, CheckCircle, Monitor,
    Lock, Award, BarChart2, ArrowRight, Loader2, Globe, Landmark, BookOpen, FlaskConical, Cpu
} from 'lucide-react';
import { projectAPI } from '../services/api';

// ── Demo questions for the "Try Demo" flow ────────────────────────────────────
const DEMO_QUESTIONS = [
    {
        id: 'q1',
        question: 'What does AI stand for in the context of computer science?',
        options: ['Automated Input', 'Artificial Intelligence', 'Advanced Integration', 'Algorithmic Inference'],
        correctAnswer: 1,
        explanation: 'AI stands for Artificial Intelligence — the simulation of human intelligence by machines.',
    },
    {
        id: 'q2',
        question: 'Which of the following is a supervised learning algorithm?',
        options: ['K-Means Clustering', 'Principal Component Analysis', 'Linear Regression', 'DBSCAN'],
        correctAnswer: 2,
        explanation: 'Linear Regression predicts a continuous output from labelled training data.',
    },
    {
        id: 'q3',
        question: 'What is the primary purpose of a CNN (Convolutional Neural Network)?',
        options: [
            'Processing sequential data like text',
            'Image and spatial data recognition',
            'Reinforcement learning only',
            'Dimensionality reduction',
        ],
        correctAnswer: 1,
        explanation: 'CNNs are designed for image tasks using convolutional filters.',
    },
    {
        id: 'q4',
        question: 'Which activation function is most commonly used in hidden layers of deep networks?',
        options: ['Sigmoid', 'Tanh', 'ReLU', 'Softmax'],
        correctAnswer: 2,
        explanation: 'ReLU avoids the vanishing gradient problem common with sigmoid/tanh.',
    },
    {
        id: 'q5',
        question: 'What does "overfitting" mean in machine learning?',
        options: [
            'Poor performance on training data',
            'Memorising training data, failing to generalise',
            'Too few parameters',
            'Learning rate too low',
        ],
        correctAnswer: 1,
        explanation: 'Overfitting means the model learns noise in training data instead of patterns.',
    },
];

// ── Feature card data ─────────────────────────────────────────────────────────
const FEATURES = [
    {
        icon: Eye,
        title: 'Gaze Tracking',
        description: 'Real-time eye movement analysis detects when attention drifts away from the screen. A 3-second threshold triggers an integrity alert.',
        color: 'text-sky-500',
        bg: 'bg-sky-50',
        border: 'hover:border-sky-300',
    },
    {
        icon: Brain,
        title: 'Multi-Face Detection',
        description: 'Computer vision instantly flags multiple faces in frame, detecting unauthorized assistance from another person in real time.',
        color: 'text-violet-500',
        bg: 'bg-violet-50',
        border: 'hover:border-violet-300',
    },
    {
        icon: Monitor,
        title: 'Device Detection',
        description: 'AI identifies unauthorized electronic devices — phones, tablets, secondary monitors — and raises a critical alert immediately.',
        color: 'text-rose-500',
        bg: 'bg-rose-50',
        border: 'hover:border-rose-300',
    },
    {
        icon: Shield,
        title: '3-Strike System',
        description: 'Each integrity violation costs one chance. At zero remaining chances, the quiz auto-terminates and the session is flagged.',
        color: 'text-amber-500',
        bg: 'bg-amber-50',
        border: 'hover:border-amber-300',
    },
    {
        icon: Zap,
        title: 'Live Visualization',
        description: 'The AI overlay renders facial landmarks, gaze vectors, and pose angles in real time — full transparency into what the model sees.',
        color: 'text-emerald-500',
        bg: 'bg-emerald-50',
        border: 'hover:border-emerald-300',
    },
    {
        icon: Lock,
        title: 'Copy & Tab Guard',
        description: 'Browser-level detection catches clipboard copy events and tab-switching attempts, adding another layer of exam integrity.',
        color: 'text-indigo-500',
        bg: 'bg-indigo-50',
        border: 'hover:border-indigo-300',
    },
];



// ── How it works steps ────────────────────────────────────────────────────────
const STEPS = [
    { num: '01', icon: Camera, title: 'Camera Access', desc: 'Grant webcam permission. ExamGuard initializes your live feed and AI engine.' },
    { num: '02', icon: Brain, title: 'AI Monitoring', desc: 'Computer vision analyzes every frame — tracking gaze, faces, pose, and devices.' },
    { num: '03', icon: AlertTriangle, title: 'Violation Alert', desc: 'Any suspicious behavior triggers an instant alert with visual and auditory feedback.' },
    { num: '04', icon: Award, title: 'Results', desc: 'Complete the quiz to receive your score, feedback, and proctoring summary.' },
];

const TOPICS = [
    { id: 'politics', label: 'Politics', icon: Landmark, color: 'text-blue-600', bg: 'bg-blue-50' },
    { id: 'geography', label: 'Geography', icon: Globe, color: 'text-emerald-600', bg: 'bg-emerald-50' },
    { id: 'general', label: 'General Knowledge', icon: BookOpen, color: 'text-amber-600', bg: 'bg-amber-50' },
    { id: 'science', label: 'Science', icon: FlaskConical, color: 'text-rose-600', bg: 'bg-rose-50' },
    { id: 'tech', label: 'Technology', icon: Cpu, color: 'text-indigo-600', bg: 'bg-indigo-50' },
];

const Landing = () => {
    const navigate = useNavigate();
    const [menuOpen, setMenuOpen] = useState(false);
    const [showTopicModal, setShowTopicModal] = useState(false);
    const [isGenerating, setIsGenerating] = useState(false);
    const [error, setError] = useState(null);

    const handleStartDemo = () => {
        setShowTopicModal(true);
    };

    const handleSelectTopic = async (topicLabel) => {
        setShowTopicModal(false);
        setIsGenerating(true);
        setError(null);

        try {
            const data = await projectAPI.generateQuiz(topicLabel);

            if (data.fallback_triggered) {
                alert(`Note: There was an issue generating a specialized quiz for "${topicLabel}". We've loaded a high-quality general knowledge quiz for you instead.`);
            }

            navigate('/quiz', {
                state: {
                    questions: data.questions,
                    quiz_id: data.quiz_id,
                    topic: data.topic || topicLabel,
                    user_id: 'web_user'
                }
            });
        } catch (err) {
            console.error('Quiz generation failed:', err);
            alert('We encountered an error generating your quiz. Loading demo questions instead.');
            navigate('/quiz', { state: { questions: DEMO_QUESTIONS, topic: 'Demo Quiz' } });
        } finally {
            setIsGenerating(false);
        }
    };

    // Logout removed (stateless)

    return (
        <div className="min-h-screen bg-[rgb(248,250,252)]" style={{ fontFamily: 'var(--font-body)' }}>

            {/* ================================================================== */}
            {/* NAV */}
            {/* ================================================================== */}
            <nav className="sticky top-0 z-50 bg-white/80 backdrop-blur-xl border-b border-[rgb(226,232,240)]">
                <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
                    {/* Logo */}
                    <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 bg-[rgb(37,99,235)] rounded-lg flex items-center justify-center ring-pulse">
                            <Shield className="w-4.5 h-4.5 text-white w-5 h-5" />
                        </div>
                        <span className="font-bold text-[rgb(15,23,42)] text-lg">
                            ExamGuard
                        </span>
                    </div>

                    {/* Auth */}
                    <div className="flex items-center gap-8">
                        {/* Nav links (moved here) */}
                        <div className="hidden md:flex items-center gap-8">
                            <a href="#features" className="nav-link">Features</a>
                            <a href="#how" className="nav-link">How it Works</a>
                        </div>

                        <div className="flex items-center gap-6">
                            <button onClick={handleStartDemo} className="btn-primary px-5 py-2.5 rounded-xl text-sm">
                                Get Started
                                <ChevronRight className="inline w-4 h-4 ml-1" />
                            </button>
                        </div>
                    </div>
                </div>
            </nav>

            {/* ================================================================== */}
            {/* HERO */}
            {/* ================================================================== */}
            <section className="relative overflow-hidden hero-grid noise min-h-[90vh] flex items-center">
                {/* Decorative orbs */}
                <div className="orb orb-blue" />
                <div className="orb orb-slate" />

                <div className="relative max-w-7xl mx-auto px-6 py-24 w-full">
                    <div className="max-w-4xl mx-auto text-center">


                        {/* Heading */}
                        <h1
                            className="text-5xl sm:text-6xl lg:text-7xl font-black text-[rgb(15,23,42)] leading-[1.05] tracking-tight mb-6 animate-slide-up-delay-1"
                        >
                            ExamGuard
                            <span className="block text-[rgb(37,99,235)]">Smart Proctored</span>
                            <span className="block">Quiz Platform</span>
                        </h1>

                        {/* Subheading */}
                        <p className="text-xl text-[rgb(71,85,105)] max-w-2xl mx-auto mb-10 leading-relaxed animate-slide-up-delay-2">
                            AI-powered exam integrity using real-time gaze detection, multi-face analysis,
                            and device recognition — all through your browser camera.
                        </p>

                        {/* CTA buttons */}
                        <div className="flex flex-col sm:flex-row gap-4 justify-center animate-slide-up-delay-3">
                            <button
                                onClick={handleStartDemo}
                                className="btn-primary px-10 py-4 rounded-2xl text-lg flex items-center justify-center gap-2 group"
                            >
                                Start Secure Quiz
                                <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                            </button>
                            <a
                                href="#features"
                                className="px-10 py-4 rounded-2xl text-lg font-semibold text-[rgb(71,85,105)] border border-[rgb(226,232,240)] bg-white hover:border-[rgb(148,163,184)] hover:text-[rgb(15,23,42)] transition-all flex items-center justify-center gap-2"
                            >
                                Explore Features
                            </a>
                        </div>

                        {/* Social proof strip */}
                        <div className="flex flex-wrap justify-center gap-6 mt-14 animate-slide-up-delay-4">
                            {[
                                { icon: CheckCircle, text: 'No signup required for demo' },
                                { icon: Camera, text: 'Uses your browser camera' },
                                { icon: Zap, text: 'Real-time AI feedback' },
                            ].map(({ icon: Icon, text }) => (
                                <div key={text} className="flex items-center gap-2 text-sm text-[rgb(148,163,184)]">
                                    <Icon className="w-4 h-4 text-[rgb(37,99,235)]" />
                                    <span>{text}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </section>

            {/* ================================================================== */}
            {/* FEATURES */}
            {/* ================================================================== */}
            <section id="features" className="py-24 px-6">
                <div className="max-w-7xl mx-auto">
                    <div className="text-center mb-16">
                        <div className="badge badge-blue mx-auto mb-4">Features</div>
                        <h2 className="text-4xl font-black text-[rgb(15,23,42)] mb-4" >
                            AI-Powered Integrity
                        </h2>
                        <p className="text-[rgb(71,85,105)] max-w-xl mx-auto">
                            Every analysis runs locally through your webcam. No data leaves your device without consent.
                        </p>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                        {FEATURES.map(({ icon: Icon, title, description, color, bg, border }) => (
                            <div
                                key={title}
                                className={`feature-card bg-white p-6 rounded-2xl border border-[rgb(226,232,240)] ${border}`}
                            >
                                <div className={`w-12 h-12 ${bg} rounded-xl flex items-center justify-center mb-4`}>
                                    <Icon className={`w-6 h-6 ${color}`} />
                                </div>
                                <h3 className="text-lg font-bold text-[rgb(15,23,42)] mb-2" >
                                    {title}
                                </h3>
                                <p className="text-sm text-[rgb(71,85,105)] leading-relaxed">{description}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* ================================================================== */}
            {/* HOW IT WORKS */}
            {/* ================================================================== */}
            <section id="how" className="py-24 px-6 bg-white border-y border-[rgb(226,232,240)]">
                <div className="max-w-7xl mx-auto">
                    <div className="text-center mb-16">
                        <div className="badge badge-blue mx-auto mb-4">Process</div>
                        <h2 className="text-4xl font-black text-[rgb(15,23,42)] mb-4" >
                            How ExamGuard Works
                        </h2>
                        <p className="text-[rgb(71,85,105)] max-w-xl mx-auto">
                            From camera access to final results — here's the four-step secure exam flow.
                        </p>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 relative">
                        {STEPS.map(({ num, icon: Icon, title, desc }, idx) => (
                            <div key={num} className="relative">
                                {/* Connector line */}
                                {idx < STEPS.length - 1 && (
                                    <div className="hidden lg:block absolute top-6 left-[calc(50%+28px)] right-[-calc(50%-28px)] h-px bg-[rgb(226,232,240)] z-0" />
                                )}
                                <div className="relative z-10 flex flex-col items-center text-center p-6 bg-[rgb(248,250,252)] rounded-2xl border border-[rgb(226,232,240)]">
                                    <div className="w-12 h-12 bg-[rgb(37,99,235)] rounded-xl flex items-center justify-center mb-4 shadow-[0_4px_12px_rgba(37,99,235,0.3)]">
                                        <Icon className="w-6 h-6 text-white" />
                                    </div>
                                    <div className="text-[10px] font-black text-[rgb(148,163,184)] tracking-[0.2em] mb-2 uppercase">
                                        Step {num}
                                    </div>
                                    <h3 className="font-bold text-[rgb(15,23,42)] mb-2" >
                                        {title}
                                    </h3>
                                    <p className="text-sm text-[rgb(71,85,105)]">{desc}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* ================================================================== */}
            {/* PROCTORING PREVIEW CALLOUT */}
            {/* ================================================================== */}
            <section className="py-24 px-6">
                <div className="max-w-5xl mx-auto">
                    <div className="bg-[rgb(15,23,42)] rounded-3xl p-10 md:p-16 relative overflow-hidden">
                        {/* BG orb */}
                        <div className="absolute right-0 top-0 w-80 h-80 bg-[rgb(37,99,235)] opacity-10 rounded-full translate-x-1/2 -translate-y-1/2 blur-3xl pointer-events-none" />

                        <div className="relative grid md:grid-cols-2 gap-12 items-center">
                            <div>
                                <div className="badge mb-6" style={{ background: 'rgba(37,99,235,0.2)', color: 'rgb(147,197,253)', borderColor: 'rgba(37,99,235,0.3)' }}>
                                    Live Demo Available
                                </div>
                                <h2 className="text-3xl font-black text-white mb-4" >
                                    Experience real-time AI proctoring right now
                                </h2>
                                <p className="text-[rgb(100,116,139)] mb-8 leading-relaxed">
                                    No account needed. Click "Start Secure Quiz" to open a demo quiz
                                    with full AI proctoring — gaze, faces, devices, all live.
                                </p>
                                <button
                                    onClick={handleStartDemo}
                                    className="btn-primary px-8 py-4 rounded-2xl text-base flex items-center gap-2 group"
                                >
                                    Launch Demo Quiz
                                    <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                                </button>
                            </div>

                            {/* Mock camera preview */}
                            <div className="relative">
                                <div className="aspect-video bg-[rgb(30,41,59)] rounded-2xl border border-[rgb(51,65,85)] overflow-hidden flex items-center justify-center">
                                    <div className="text-center text-[rgb(71,85,105)]">
                                        <Camera className="w-12 h-12 mx-auto mb-3 opacity-40" />
                                        <p className="text-sm font-medium opacity-60">Camera Preview</p>
                                        <p className="text-xs opacity-40 mt-1">Activates on quiz start</p>
                                    </div>
                                    {/* Fake overlay elements */}
                                    <div className="absolute top-3 left-3 flex items-center gap-2 px-3 py-1.5 bg-red-500/70 rounded-full text-[10px] font-bold text-white uppercase tracking-wider">
                                        <div className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" />
                                        Live Monitoring
                                    </div>
                                    <div className="absolute bottom-3 right-3 px-2 py-1 bg-black/50 rounded text-[9px] font-mono text-[rgb(100,116,139)]">
                                        4.8 FPS · Connected
                                    </div>
                                </div>
                                {/* Floating badges */}
                                <div className="absolute -bottom-4 -left-4 bg-white rounded-xl px-4 py-2 shadow-lg border border-[rgb(226,232,240)] flex items-center gap-2">
                                    <div className="w-2 h-2 bg-green-500 rounded-full shadow-[0_0_8px_#22c55e]" />
                                    <span className="text-xs font-bold text-[rgb(15,23,42)]">AI Engine: Connected</span>
                                </div>
                                <div className="absolute -top-4 -right-4 bg-white rounded-xl px-4 py-2 shadow-lg border border-[rgb(226,232,240)] flex items-center gap-2">
                                    <Shield className="w-3 h-3 text-[rgb(37,99,235)]" />
                                    <span className="text-xs font-bold text-[rgb(15,23,42)]">3/3 Integrity</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* ================================================================== */}
            {/* BOTTOM CTA */}
            {/* ================================================================== */}
            <section className="py-24 px-6 border-t border-[rgb(226,232,240)] bg-white">
                <div className="max-w-3xl mx-auto text-center">
                    <div className="w-16 h-16 bg-[rgb(239,246,255)] rounded-2xl flex items-center justify-center mx-auto mb-6 ring-pulse">
                        <Shield className="w-8 h-8 text-[rgb(37,99,235)]" />
                    </div>
                    <h2 className="text-4xl font-black text-[rgb(15,23,42)] mb-4" >
                        Ready to take the exam?
                    </h2>
                    <p className="text-[rgb(71,85,105)] mb-8 text-lg">
                        Start the demo quiz now — no signup, no installs, just your camera and 5 questions.
                    </p>
                    <button
                        onClick={handleStartDemo}
                        className="btn-primary px-12 py-4 rounded-2xl text-lg flex items-center gap-2 mx-auto group"
                    >
                        Start Secure Quiz
                        <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                    </button>
                </div>
            </section>

            {/* ================================================================== */}
            {/* FOOTER */}
            {/* ================================================================== */}
            <footer className="bg-[rgb(15,23,42)] py-10 px-6">
                <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
                    <div className="flex items-center gap-2">
                        <div className="w-6 h-6 bg-[rgb(37,99,235)] rounded-md flex items-center justify-center">
                            <Shield className="w-3.5 h-3.5 text-white" />
                        </div>
                        <span className="text-white font-bold text-sm" >
                            ExamGuard
                        </span>
                    </div>
                    <p className="text-[rgb(71,85,105)] text-xs">
                        Smart Proctored Quiz Platform — Computer Vision · FYP Module
                    </p>
                    <div className="flex items-center gap-2">
                        <BarChart2 className="w-4 h-4 text-[rgb(71,85,105)]" />
                        <span className="text-[rgb(71,85,105)] text-xs">Real-time AI Analysis</span>
                    </div>
                </div>
            </footer>

            {/* Topic Selection Modal */}
            {showTopicModal && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-slate-900/40 backdrop-blur-sm animate-fade-in">
                    <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl border border-slate-200 overflow-hidden animate-zoom-in relative">
                        <div className="p-8">
                            <button
                                onClick={() => setShowTopicModal(false)}
                                className="absolute top-4 right-4 p-2 rounded-full hover:bg-slate-100 transition-colors"
                            >
                                <X className="w-5 h-5 text-slate-400" />
                            </button>
                            <div className="w-12 h-12 bg-blue-50 rounded-2xl flex items-center justify-center mb-6">
                                <Brain className="w-6 h-6 text-blue-600" />
                            </div>
                            <h2 className="text-2xl font-black text-slate-900 mb-2">Select Quiz Topic</h2>
                            <p className="text-slate-500 text-sm mb-8 italic">Choose what you want to be tested on</p>

                            <div className="grid gap-3">
                                {TOPICS.map((topic) => (
                                    <button
                                        key={topic.id}
                                        onClick={() => handleSelectTopic(topic.label)}
                                        className="flex items-center gap-4 p-4 rounded-2xl border border-slate-100 bg-slate-50/50 hover:bg-white hover:border-blue-200 hover:shadow-md transition-all group text-left w-full"
                                    >
                                        <div className={`w-10 h-10 ${topic.bg} rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform`}>
                                            <topic.icon className={`w-5 h-5 ${topic.color}`} />
                                        </div>
                                        <span className="font-bold text-slate-700">{topic.label}</span>
                                        <ArrowRight className="w-4 h-4 ml-auto text-slate-300 group-hover:text-blue-500 group-hover:translate-x-1 transition-all" />
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Generating Loading State */}
            {isGenerating && (
                <div className="fixed inset-0 z-[110] flex flex-col items-center justify-center bg-white/90 backdrop-blur-md animate-fade-in">
                    <div className="relative mb-8 text-center">
                        <div className="w-24 h-24 rounded-full border-4 border-slate-100 border-t-blue-600 animate-spin mx-auto shadow-xl" />
                        <div className="absolute inset-0 flex items-center justify-center">
                            <Brain className="w-8 h-8 text-blue-600 animate-pulse" />
                        </div>
                    </div>
                    <h2 className="text-3xl font-black text-slate-900 tracking-tight">
                        AI is Crafting Your Quiz
                    </h2>
                    <p className="text-slate-500 mt-4 font-medium italic animate-pulse">
                        Generating 10 custom questions using Groq...
                    </p>
                </div>
            )}
        </div>
    );
};

export default Landing;