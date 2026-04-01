import React from 'react';
import {
    AlertTriangle, User, Eye, ShieldCheck, Monitor,
    ShieldX, Activity, Brain, Circle,
} from 'lucide-react';

const ProctorStats = ({
    stats = {},
    behaviorStatus = 'Not started',
    chances = 3,
    devicesDetected = [],
    connectionStatus = 'disconnected',
    violationLogs = [],
    gazeViolationDuration = 0,
    devicesCritical = [],
    devicesHighRisk = [],
    devicesMediumRisk = [],
    devicesLowRisk = [],
    devicesTotal = 0,
}) => {
    // ── status classification ──────────────────────────────────────────────────
    const isCritical =
        behaviorStatus.toLowerCase().includes('multiple') ||
        behaviorStatus.toLowerCase().includes('no person') ||
        devicesCritical.length > 0 ||
        devicesDetected.length > 0;

    const isWarning =
        behaviorStatus.toLowerCase().includes('away') ||
        behaviorStatus.toLowerCase().includes('down') ||
        behaviorStatus.toLowerCase().includes('deviation') ||
        devicesHighRisk.length > 0;

    const isGazeAlert =
        behaviorStatus.toLowerCase().includes('away') ||
        behaviorStatus.toLowerCase().includes('looking');

    const chanceColor =
        chances === 3 ? 'sky' : chances === 2 ? 'yellow' : 'red';

    // ── render ─────────────────────────────────────────────────────────────────
    return (
        <div className="flex flex-col gap-4 max-h-[calc(100vh-120px)] overflow-y-auto pr-2 custom-scrollbar">

            {/* ── Integrity Score ── */}
            <div className="p-4 bg-white border border-[rgb(226,232,240)] rounded-xl">
                <h3 className="text-[10px] font-bold text-[rgb(148,163,184)] uppercase tracking-[0.15em] mb-3 flex items-center gap-2">
                    <ShieldCheck className="w-3 h-3" />
                    Integrity Score
                </h3>
                <div className="flex items-center justify-between">
                    <div className="flex gap-1.5">
                        {[...Array(3)].map((_, i) => (
                            <div
                                key={i}
                                className={`w-8 h-8 rounded-lg flex items-center justify-center border-2 transition-all duration-300 ${i < chances
                                    ? chanceColor === 'sky' ? 'bg-sky-500/20 border-sky-500 text-sky-400'
                                        : chanceColor === 'yellow' ? 'bg-yellow-500/20 border-yellow-500 text-yellow-400'
                                            : 'bg-red-500/20 border-red-500 text-red-400'
                                    : 'bg-red-500/20 border-red-500 text-red-500 opacity-40'
                                    }`}
                            >
                                {i < chances
                                    ? <ShieldCheck className="w-5 h-5" />
                                    : <ShieldX className="w-5 h-5" />
                                }
                            </div>
                        ))}
                    </div>
                    <div className="text-right">
                        <span className={`text-3xl font-black ${chances === 1 ? 'text-red-500 animate-pulse' :
                            chances === 2 ? 'text-yellow-500' :
                                'text-[rgb(15,23,42)]'
                            }`} >
                            {chances}
                        </span>
                        <span className="text-gray-600 text-sm font-bold ml-1">/ 3</span>
                    </div>
                </div>
                {chances < 3 && (
                    <div className={`mt-3 pt-3 border-t border-[rgb(226,232,240)] text-[10px] font-bold uppercase tracking-wider ${chances === 1 ? 'text-red-500' : 'text-yellow-500'
                        }`}>
                        ⚠️ {chances === 1 ? 'Final warning' : `${3 - chances} violations detected`}
                    </div>
                )}
            </div>

            {/* ── Live Behavior Status ── */}
            <div className={`p-4 rounded-xl border transition-all duration-300 ${isCritical ? 'bg-red-500/10 border-red-500 animate-pulse' :
                isWarning ? 'bg-yellow-500/10 border-yellow-500/50' :
                    'bg-white border-[rgb(226,232,240)]'
                }`}>
                <div className="flex items-center gap-2 mb-2">
                    <AlertTriangle className={`w-4 h-4 ${isCritical ? 'text-red-500' :
                        isWarning ? 'text-yellow-500' :
                            'text-[rgb(148,163,184)]'
                        }`} />
                    <h3 className="text-[10px] uppercase font-bold text-[rgb(148,163,184)] tracking-[0.15em]">
                        Live Behavior Status
                    </h3>
                </div>
                <div className={`text-sm font-bold uppercase tracking-tight ${isCritical ? 'text-red-500' :
                    isWarning ? 'text-yellow-500' :
                        'text-green-500'
                    }`}>
                    {behaviorStatus}
                </div>
                {isGazeAlert && gazeViolationDuration > 0 && (
                    <div className="mt-2 flex items-center gap-2 text-[10px] text-yellow-500">
                        <Activity className="w-3 h-3 animate-pulse" />
                        <span>Duration: {gazeViolationDuration.toFixed(1)}s</span>
                    </div>
                )}
            </div>

            {/* ── Device Detection Alert ── */}
            {devicesTotal > 0 && (
                <div className={`p-4 rounded-xl border space-y-3 ${devicesCritical.length > 0 
                    ? 'bg-red-900/20 border-2 border-red-500 animate-bounce shadow-[0_0_20px_rgba(239,68,68,0.3)]' 
                    : devicesHighRisk.length > 0 
                    ? 'bg-yellow-900/20 border-2 border-yellow-500 shadow-[0_0_15px_rgba(234,179,8,0.2)]'
                    : 'bg-blue-900/20 border-2 border-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.2)]'
                }`}>
                    {/* CRITICAL Devices */}
                    {devicesCritical.length > 0 && (
                        <div>
                            <div className="flex items-center gap-2 mb-2">
                                <Monitor className="w-4 h-4 text-red-500 animate-pulse" />
                                <h3 className="text-[10px] uppercase font-black text-red-500 tracking-[0.15em]">
                                    🚨 CRITICAL: {devicesCritical.length} DEVICE{devicesCritical.length !== 1 ? 'S' : ''}
                                </h3>
                            </div>
                            <div className="flex flex-wrap gap-2 pl-0">
                                {devicesCritical.map((device, i) => (
                                    <span key={i} className="px-2 py-1 bg-red-600 text-white text-[9px] font-black rounded uppercase shadow-md animate-pulse">
                                        {device}
                                    </span>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* HIGH RISK Devices */}
                    {devicesHighRisk.length > 0 && (
                        <div>
                            <div className="flex items-center gap-2 mb-2">
                                <AlertTriangle className="w-4 h-4 text-yellow-500" />
                                <h3 className="text-[10px] uppercase font-black text-yellow-500 tracking-[0.15em]">
                                    ⚠️ HIGH-RISK: {devicesHighRisk.length} DEVICE{devicesHighRisk.length !== 1 ? 'S' : ''}
                                </h3>
                            </div>
                            <div className="flex flex-wrap gap-2 pl-0">
                                {devicesHighRisk.map((device, i) => (
                                    <span key={i} className="px-2 py-1 bg-yellow-600 text-white text-[9px] font-black rounded uppercase shadow-md">
                                        {device}
                                    </span>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* MEDIUM RISK Devices */}
                    {devicesMediumRisk.length > 0 && (
                        <div>
                            <div className="flex items-center gap-2 mb-2">
                                <Circle className="w-4 h-4 text-blue-500" />
                                <h3 className="text-[10px] uppercase font-black text-blue-500 tracking-[0.15em]">
                                    ℹ️ MEDIUM-RISK: {devicesMediumRisk.length} DEVICE{devicesMediumRisk.length !== 1 ? 'S' : ''}
                                </h3>
                            </div>
                            <div className="flex flex-wrap gap-2 pl-0">
                                {devicesMediumRisk.map((device, i) => (
                                    <span key={i} className="px-2 py-1 bg-blue-600 text-white text-[9px] font-black rounded uppercase shadow-md">
                                        {device}
                                    </span>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* LOW RISK Devices */}
                    {devicesLowRisk.length > 0 && (
                        <div>
                            <div className="flex items-center gap-2 mb-2">
                                <Circle className="w-4 h-4 text-gray-500" />
                                <h3 className="text-[10px] uppercase font-black text-gray-600 tracking-[0.15em]">
                                    📝 LOW-RISK: {devicesLowRisk.length} DEVICE{devicesLowRisk.length !== 1 ? 'S' : ''}
                                </h3>
                            </div>
                            <div className="flex flex-wrap gap-2 pl-0">
                                {devicesLowRisk.map((device, i) => (
                                    <span key={i} className="px-2 py-1 bg-gray-600 text-white text-[9px] font-black rounded uppercase shadow-md opacity-75">
                                        {device}
                                    </span>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Device Count Summary */}
                    <div className="pt-2 border-t border-gray-300/30 flex justify-between items-center text-[9px] font-mono text-gray-700">
                        <span>Total Devices Detected:</span>
                        <span className="font-black text-lg text-gray-900">{devicesTotal}</span>
                    </div>
                </div>
            )}

            {/* ── Metrics Grid ── */}
            <div className="grid grid-cols-2 gap-3 pb-3 border-b border-[rgb(226,232,240)]">
                {/* Face Count */}
                <div className="p-3 bg-[rgb(248,250,252)]/40 rounded-lg border border-[rgb(226,232,240)]">
                    <div className="flex items-center gap-2 text-gray-600 mb-1">
                        <User className="w-3 h-3" />
                        <span className="text-[9px] uppercase font-black tracking-wider">Faces</span>
                    </div>
                    <div className={`text-xl font-black ${stats.numFaces !== 1 ? 'text-red-500' : 'text-[rgb(15,23,42)]'}`}
                    >
                        {stats.numFaces || 0}
                    </div>
                </div>

                {/* Gaze Direction */}
                <div className="p-3 bg-[rgb(248,250,252)]/40 rounded-lg border border-[rgb(226,232,240)]">
                    <div className="flex items-center gap-2 text-gray-600 mb-1">
                        <Eye className="w-3 h-3" />
                        <span className="text-[9px] uppercase font-black tracking-wider">Gaze H/V</span>
                    </div>
                    <div className={`text-xs font-black font-mono ${Math.abs(stats.gazeHorizontal || 0) > 15 || Math.abs(stats.gazeVertical || 0) > 15
                        ? 'text-yellow-500' : 'text-[rgb(15,23,42)]'
                        }`}>
                        {stats.gazeHorizontal > 0 ? '→' : stats.gazeHorizontal < 0 ? '←' : '•'}
                        {Math.abs(stats.gazeHorizontal || 0).toFixed(0)}° /&nbsp;
                        {stats.gazeVertical > 0 ? '↓' : stats.gazeVertical < 0 ? '↑' : '•'}
                        {Math.abs(stats.gazeVertical || 0).toFixed(0)}°
                    </div>
                </div>

                {/* Eye Aspect Ratio */}
                <div className="p-3 bg-[rgb(248,250,252)]/40 rounded-lg border border-[rgb(226,232,240)]">
                    <div className="flex items-center gap-2 text-gray-600 mb-1">
                        <Circle className="w-3 h-3" />
                        <span className="text-[9px] uppercase font-black tracking-wider">Eye Open</span>
                    </div>
                    <div className={`text-xs font-black font-mono ${(stats.ear || 0) < 0.15 ? 'text-yellow-500' : 'text-[rgb(15,23,42)]'
                        }`}>
                        {((stats.ear || 0) * 100).toFixed(0)}%
                    </div>
                </div>

                {/* AI FPS */}
                <div className="p-3 bg-[rgb(248,250,252)]/40 rounded-lg border border-[rgb(226,232,240)]">
                    <div className="flex items-center gap-2 text-gray-600 mb-1">
                        <Activity className="w-3 h-3" />
                        <span className="text-[9px] uppercase font-black tracking-wider">AI FPS</span>
                    </div>
                    <div className={`text-xs font-black font-mono ${(stats.fps || 0) < 3 ? 'text-yellow-500' : 'text-[rgb(15,23,42)]'
                        }`}>
                        {(stats.fps || 0).toFixed(1)} FPS
                    </div>
                </div>
            </div>

            {/* ── Advanced Metrics ── */}
            <details className="bg-[rgb(248,250,252)]/40 rounded-lg border border-[rgb(226,232,240)]">
                <summary className="p-3 cursor-pointer text-[10px] uppercase font-black text-[rgb(148,163,184)] tracking-[0.15em]">
                    📊 Advanced Metrics
                </summary>
                <div className="p-3 pt-0 space-y-2 text-[10px]">
                    {[
                        ['Head Pitch', `${(stats.headPitch || 0).toFixed(1)}°`],
                        ['Head Yaw', `${(stats.headYaw || 0).toFixed(1)}°`],
                        ['Head Roll', `${(stats.headRoll || 0).toFixed(1)}°`],
                        ['Hand-Face (L)', (stats.handFaceDistLeft || 0).toFixed(3)],
                        ['Hand-Face (R)', (stats.handFaceDistRight || 0).toFixed(3)],
                        ['Processing Time', `${(stats.processingTime || 0).toFixed(1)}ms`],
                    ].map(([label, value]) => (
                        <div key={label} className="flex justify-between">
                            <span className="text-gray-600">{label}:</span>
                            <span className="text-[rgb(15,23,42)] font-mono">{value}</span>
                        </div>
                    ))}
                </div>
            </details>

            {/* ── Violation Log ── */}
            <div className="flex-1 min-h-[200px] flex flex-col">
                <h3 className="text-[10px] font-black text-gray-600 uppercase tracking-[0.2em] mb-3 flex items-center justify-between">
                    <span>📋 Violation Timeline</span>
                    <span className={violationLogs.length > 0 ? 'text-red-500 bg-red-100 px-2 py-1 rounded' : 'text-gray-700'}>
                        {violationLogs.length} {violationLogs.length === 1 ? 'VIOLATION' : 'VIOLATIONS'}
                    </span>
                </h3>
                <div className="flex-1 space-y-2 overflow-y-auto pr-2 custom-scrollbar max-h-[300px]">
                    {violationLogs.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-10 text-gray-700 opacity-50 border-2 border-dashed border-[rgb(226,232,240)] rounded-xl">
                            <ShieldCheck className="w-8 h-8 mb-2" />
                            <p className="text-[10px] uppercase font-bold">No Violations Yet</p>
                            <p className="text-[8px] text-gray-800 mt-1">Keep up the good behavior!</p>
                        </div>
                    ) : (
                        violationLogs.map((log, i) => {
                            // Get violation icon and description
                            const violationInfo = {
                                'gaze_off_screen': { icon: '👀', desc: 'Eyes off screen for 3+ seconds' },
                                'multiple_faces_detected': { icon: '👥', desc: 'Multiple faces detected in frame' },
                                'no_person_detected': { icon: '❌', desc: 'No person detected in frame' },
                                'device_detected': { icon: '📱', desc: 'Suspicious device detected' },
                                'device_detected_critical': { icon: '🚨', desc: 'CRITICAL device detected' },
                                'hand_face_interference': { icon: '🖐️', desc: 'Hand near face position' },
                            };
                            const info = violationInfo[log.type] || { icon: '⚠️', desc: log.type.replace(/_/g, ' ') };
                            
                            return (
                                <div key={i} className="p-3 bg-red-50 border-l-4 border-red-500 rounded-r-lg flex flex-col gap-1.5 animate-in slide-in-from-right-2 duration-200 hover:bg-red-100 transition-colors">
                                    <div className="flex justify-between items-start gap-2">
                                        <div className="flex items-start gap-2 flex-1 min-w-0">
                                            <span className="text-lg flex-shrink-0">{info.icon}</span>
                                            <div className="min-w-0 flex-1">
                                                <div className="text-[10px] font-bold text-red-600 uppercase tracking-tight leading-tight">
                                                    {info.desc}
                                                </div>
                                                {log.behavior && (
                                                    <div className="text-[8px] text-gray-600 italic leading-tight mt-0.5">
                                                        {log.behavior}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                        <div className="flex-shrink-0 text-right">
                                            <div className="text-[9px] font-mono text-gray-500">{log.time}</div>
                                            <div className="text-[9px] font-black text-red-600 bg-red-100 px-2 rounded mt-0.5">-1</div>
                                        </div>
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>
            </div>

            {/* ── Connection Status ── */}
            <div className="flex items-center justify-between gap-2 pt-4 border-t border-[rgb(226,232,240)]">
                <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full transition-all duration-300 ${connectionStatus === 'connected' ? 'bg-green-500 shadow-[0_0_10px_#22c55e]' :
                        connectionStatus === 'connecting' ? 'bg-yellow-500 animate-pulse' :
                            'bg-red-500 animate-pulse'
                        }`} />
                    <span className="text-[9px] text-gray-600 uppercase font-black tracking-[0.15em]">
                        AI ENGINE:{' '}
                        <span className={connectionStatus === 'connected' ? 'text-green-500' : 'text-red-500'}>
                            {connectionStatus}
                        </span>
                    </span>
                </div>
                <div className="flex items-center gap-1">
                    <Brain className="w-3 h-3 text-gray-700" />
                    <span className="text-[9px] font-mono text-gray-700">
                        {(stats.fps || 0).toFixed(1)} FPS
                    </span>
                </div>
            </div>
        </div>
    );
};

export default ProctorStats;