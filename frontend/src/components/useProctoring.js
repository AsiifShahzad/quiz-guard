/**
 * useProctoring Hook
 *
 * Manages WebSocket connection to the AI proctoring backend,
 * frame transmission, and all proctoring state.
 *
 * Fixes:
 * 1. startProctoring / stopProctoring guarded with isRunning ref
 * 2. connectWebSocket has stable empty-dep-array + reads via refs
 * 3. reconnectAttempts tracked via ref, not state, to avoid re-render loops
 */

import { useState, useRef, useEffect, useCallback } from 'react';

const useProctoring = (options = {}) => {
    const {
        url = 'ws://localhost:8000/ws/proctor',
        onAlert = () => { },
        onResult = () => { },
        frameRate = 5,
        autoReconnect = true,
        reconnectDelay = 2000,
        maxReconnectAttempts = 5,
    } = options;

    // ── stable option refs ─────────────────────────────────────────────────────
    const urlRef = useRef(url);
    const onAlertRef = useRef(onAlert);
    const onResultRef = useRef(onResult);
    const autoReconnectRef = useRef(autoReconnect);
    const reconnectDelayRef = useRef(reconnectDelay);
    const maxReconnectAttemptsRef = useRef(maxReconnectAttempts);

    useEffect(() => { urlRef.current = url; }, [url]);
    useEffect(() => { onAlertRef.current = onAlert; }, [onAlert]);
    useEffect(() => { onResultRef.current = onResult; }, [onResult]);
    useEffect(() => { autoReconnectRef.current = autoReconnect; }, [autoReconnect]);
    useEffect(() => { reconnectDelayRef.current = reconnectDelay; }, [reconnectDelay]);
    useEffect(() => { maxReconnectAttemptsRef.current = maxReconnectAttempts; }, [maxReconnectAttempts]);

    // ── state ──────────────────────────────────────────────────────────────────
    const [isProctoring, setIsProctoring] = useState(false);
    const [connectionStatus, setConnectionStatus] = useState('disconnected');
    const [behaviorStatus, setBehaviorStatus] = useState('Not started');
    const [devicesDetected, setDevicesDetected] = useState([]);
    const [visualization, setVisualization] = useState('');
    const [stats, setStats] = useState({
        numFaces: 0, gazeHorizontal: 0, gazeVertical: 0,
        ear: 0, headPitch: 0, headYaw: 0, headRoll: 0,
        handFaceDistLeft: 0, handFaceDistRight: 0,
        processingTime: 0, fps: 0, avgFps: 0,
    });
    const [lastAlert, setLastAlert] = useState(null);
    const [reconnectAttempts, setReconnectAttempts] = useState(0);

    // ── refs ───────────────────────────────────────────────────────────────────
    const wsRef = useRef(null);
    const reconnectTimeoutRef = useRef(null);
    const isSendingRef = useRef(false);
    const isRunningRef = useRef(false);
    const reconnectCountRef = useRef(0);
    const isProctoringRef = useRef(false);

    // ── WebSocket connection ───────────────────────────────────────────────────
    const connectWebSocket = useCallback(() => {
        if (wsRef.current?.readyState === WebSocket.OPEN) return;
        if (reconnectTimeoutRef.current) {
            clearTimeout(reconnectTimeoutRef.current);
            reconnectTimeoutRef.current = null;
        }

        setConnectionStatus('connecting');

        try {
            const ws = new WebSocket(urlRef.current);

            ws.onopen = () => {
                setConnectionStatus('connected');
                reconnectCountRef.current = 0;
                setReconnectAttempts(0);
            };

            ws.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    if (data.error) { setConnectionStatus('error'); return; }

                    if (data.behavior_status) setBehaviorStatus(data.behavior_status);
                    if (data.devices_detected) setDevicesDetected(data.devices_detected);
                    if (data.viz) setVisualization(data.viz);

                    // Extract stats directly from data (backend returns them at top level)
                    setStats({
                        numFaces: data.num_faces || 0,
                        gazeHorizontal: data.gaze_horizontal || 0,
                        gazeVertical: data.gaze_vertical || 0,
                        ear: data.eye_aspect_ratio || 0,
                        headPitch: data.head_pitch || 0,
                        headYaw: data.head_yaw || 0,
                        headRoll: data.head_roll || 0,
                        handFaceDistLeft: data.hand_face_distance_left || 0,
                        handFaceDistRight: data.hand_face_distance_right || 0,
                        processingTime: data.processing_time_ms || 0,
                        fps: data.fps || 0,
                        avgFps: data.avg_fps || 0,
                        faceDetectionConfidence: data.face_detection_confidence || 0,
                        // New comprehensive device detection fields
                        devicesTotal: data.devices_detected_total || 0,
                        devicesCritical: data.devices_critical || [],
                        devicesHighRisk: data.devices_high_risk || [],
                        devicesMediumRisk: data.devices_medium_risk || [],
                        devicesLowRisk: data.devices_low_risk || [],
                    });

                    if (data.alert && data.alert !== 'none') {
                        setLastAlert({ type: data.alert, confidence: data.conf, timestamp: data.timestamp || Date.now() });
                        onAlertRef.current(data);
                    }

                    onResultRef.current(data);
                } catch (error) {
                    console.error('Error parsing proctoring message:', error);
                }
            };

            ws.onerror = () => setConnectionStatus('error');

            ws.onclose = (event) => {
                setConnectionStatus('disconnected');
                if (
                    autoReconnectRef.current &&
                    isProctoringRef.current &&
                    reconnectCountRef.current < maxReconnectAttemptsRef.current
                ) {
                    reconnectCountRef.current += 1;
                    setReconnectAttempts(reconnectCountRef.current);
                    reconnectTimeoutRef.current = setTimeout(connectWebSocket, reconnectDelayRef.current);
                } else if (reconnectCountRef.current >= maxReconnectAttemptsRef.current) {
                    setConnectionStatus('failed');
                }
            };

            wsRef.current = ws;
        } catch (error) {
            console.error('Failed to create WebSocket:', error);
            setConnectionStatus('error');
        }
    }, []); // stable — reads everything via refs

    // ── send frame ─────────────────────────────────────────────────────────────
    const sendFrame = useCallback((frameData) => {
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return false;
        if (isSendingRef.current) return false;

        try {
            isSendingRef.current = true;
            const cleanFrame = frameData.includes(',') ? frameData.split(',')[1] : frameData;
            wsRef.current.send(JSON.stringify({ frame: cleanFrame, timestamp: Date.now() }));
            isSendingRef.current = false;
            return true;
        } catch (error) {
            console.error('Error sending frame:', error);
            isSendingRef.current = false;
            return false;
        }
    }, []);

    // ── start / stop ───────────────────────────────────────────────────────────
    const startProctoring = useCallback(() => {
        if (isRunningRef.current) return;
        isRunningRef.current = true;
        isProctoringRef.current = true;
        setIsProctoring(true);
        reconnectCountRef.current = 0;
        setReconnectAttempts(0);
        connectWebSocket();
    }, [connectWebSocket]);

    const stopProctoring = useCallback(() => {
        if (!isRunningRef.current) return;
        isRunningRef.current = false;
        isProctoringRef.current = false;
        setIsProctoring(false);

        if (wsRef.current) { wsRef.current.close(1000, 'User stopped proctoring'); wsRef.current = null; }
        if (reconnectTimeoutRef.current) { clearTimeout(reconnectTimeoutRef.current); reconnectTimeoutRef.current = null; }

        setConnectionStatus('disconnected');
        setBehaviorStatus('Stopped');
        setVisualization('');
        setDevicesDetected([]);
        setLastAlert(null);
        setReconnectAttempts(0);
        reconnectCountRef.current = 0;
        isSendingRef.current = false;
    }, []);

    const restartConnection = useCallback(() => {
        stopProctoring();
        setTimeout(() => startProctoring(), 500);
    }, [startProctoring, stopProctoring]);

    // ── cleanup on unmount ─────────────────────────────────────────────────────
    useEffect(() => {
        return () => {
            isRunningRef.current = false;
            isProctoringRef.current = false;
            if (wsRef.current) { wsRef.current.close(1000, 'Component unmounted'); wsRef.current = null; }
            if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
        };
    }, []);

    // ── public API ─────────────────────────────────────────────────────────────
    return {
        isProctoring, connectionStatus, behaviorStatus,
        devicesDetected, visualization, stats,
        lastAlert, reconnectAttempts,
        startProctoring, stopProctoring, sendFrame, restartConnection,
        isConnected: connectionStatus === 'connected',
        isConnecting: connectionStatus === 'connecting',
        hasError: connectionStatus === 'error' || connectionStatus === 'failed',
    };
};

export default useProctoring;