/**
 * Quiz Component - Production Ready
 * 
 * Secure quiz interface with AI proctoring integration
 * - 3-strike integrity system
 * - Real-time AI proctoring with YOLOv8 device detection
 * - 3-second gaze violation threshold
 * - Immediate alerts for critical violations
 * - Auto-termination on 0 chances
 */

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import {
  CheckCircle, Clock, AlertCircle, X, ShieldAlert, ShieldX,
  PlayCircle, AlertTriangle
} from 'lucide-react';
import ProctorFeed from './ProctorFeed';
import ProctorStats from './ProctorStats';
import useProctoring from './useProctoring';

// CSRF Token Helper
const getCsrfToken = () => {
  const match = document.cookie.match(/csrf_token=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
};

const Quiz = ({ questions: propQuestions, quizId, userId }) => {
  const { courseId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();

  // Quiz State
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [answers, setAnswers] = useState({});
  const [showResults, setShowResults] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submissionResult, setSubmissionResult] = useState(null);
  const [quizStarted, setQuizStarted] = useState(false);
  const [quizTerminated, setQuizTerminated] = useState(false);
  const [quizStartTime, setQuizStartTime] = useState(null);

  // Proctoring State
  const [chances, setChances] = useState(3);
  const [violationLogs, setViolationLogs] = useState([]);
  const gazeTimerRef = useRef(null);

  // Get quiz questions from props, location state, or default empty array
  const quizQuestions = propQuestions || location.state?.questions || [];

  // Smart Back Navigation (moved after proctoring setup)
  const handleBackToWorkspace = useCallback(() => {
    if (location.pathname.startsWith('/project-quiz')) {
      navigate('/projects');
      return;
    }
    if (courseId) {
      navigate(`/courses/${courseId}/workspace`);
      return;
    }
    if (window.history.length > 1) {
      navigate(-1);
    } else {
      navigate('/');
    }
  }, [location.pathname, courseId, navigate]);

  // Proctoring Integration
  const {
    isProctoring,
    startProctoring,
    stopProctoring,
    sendFrame,
    visualization,
    statistics,
  } = useProctoring({
    quizId,
    onAlert: (alertData) => {
      // Handle various alert types
      if (alertData?.alert || alertData?.type) {
        const violationType = alertData.alert || alertData.type;
        const timestamp = new Date().toLocaleTimeString();
        setViolationLogs(prev => [...prev, { type: violationType, time: timestamp }]);
        setChances(prev => {
          const newChances = prev - 1;
          if (newChances <= 0) {
            terminateQuiz();
          }
          return newChances;
        });
      }
    }
  });

  // Calculate Score
  const calculateScore = () => {
    let correct = 0;
    quizQuestions.forEach((q, idx) => {
      if (answers[idx] === q.correctAnswer) correct++;
    });
    return {
      correct,
      total: quizQuestions.length,
      percentage: Math.round((correct / quizQuestions.length) * 100)
    };
  };

  // Submit Quiz
  const handleSubmitQuiz = async () => {
    setIsSubmitting(true);
    stopProctoring();

    const user_answers = quizQuestions.map((q, idx) => {
      const answerIndex = answers[idx];
      let selected_letter = null;
      if (typeof answerIndex === 'number') {
        selected_letter = String.fromCharCode(65 + answerIndex);
      }
      return { question_id: q.id, selected_answer: selected_letter };
    });

    if (!quizId) {
      const calc = calculateScore();
      setSubmissionResult({
        score: calc.correct,
        total: calc.total,
        results: quizQuestions.map((q, idx) => ({
          question_id: q.id,
          is_correct: answers[idx] === q.correctAnswer,
          explanation: q.explanation || ''
        }))
      });
      setShowResults(true);
      setIsSubmitting(false);
      return;
    }

    try {
      const csrfToken = getCsrfToken();
      const res = await fetch('http://localhost:8000/api/quiz/submit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(csrfToken && { 'x-csrf-token': csrfToken }),
        },
        credentials: 'include',
        body: JSON.stringify({ quiz_id: quizId, user_id: userId, user_answers }),
      });

      if (!res.ok) throw new Error(`Server error: ${res.status}`);

      const data = await res.json();
      setSubmissionResult(data);
      setShowResults(true);
    } catch (err) {
      alert(`Quiz submission failed: ${err.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Start Quiz
  const handleStartQuiz = () => {
    setQuizStartTime(Date.now());
    startProctoring();
    setQuizStarted(true);
  };

  // Terminate Quiz
  const terminateQuiz = () => {
    stopProctoring();
    setQuizTerminated(true);
  };

  // Question Navigation
  const handleOptionSelect = (questionIdx, optionIdx) => {
    setAnswers(prev => ({ ...prev, [questionIdx]: optionIdx }));
  };

  const handleNextQuestion = () => {
    if (currentQuestion < quizQuestions.length - 1) {
      setCurrentQuestion(prev => prev + 1);
    }
  };

  const handlePreviousQuestion = () => {
    if (currentQuestion > 0) {
      setCurrentQuestion(prev => prev - 1);
    }
  };

  // Cleanup
  useEffect(() => {
    return () => {
      stopProctoring();
      if (gazeTimerRef.current) clearInterval(gazeTimerRef.current);
    };
  }, [stopProctoring]);

  // Copy & Tab Switch Detection - handlers scoped to effect to prevent duplicate listeners
  useEffect(() => {
    if (!quizStarted) return;

    let violationTimeout;
    const handleCopyEvent = () => {
      clearTimeout(violationTimeout);
      violationTimeout = setTimeout(() => {
        const timestamp = new Date().toLocaleTimeString();
        setViolationLogs(prev => [...prev, { type: 'copy_detected', time: timestamp }]);
        setChances(prev => {
          const newChances = prev - 1;
          if (newChances <= 0) {
            terminateQuiz();
          }
          return newChances;
        });
      }, 100);
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        const timestamp = new Date().toLocaleTimeString();
        setViolationLogs(prev => [...prev, { type: 'tab_switch', time: timestamp }]);
        setChances(prev => {
          const newChances = prev - 1;
          if (newChances <= 0) {
            terminateQuiz();
          }
          return newChances;
        });
      }
    };

    window.addEventListener('copy', handleCopyEvent);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      clearTimeout(violationTimeout);
      window.removeEventListener('copy', handleCopyEvent);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [quizStarted]);

  // RENDER LOGIC

  // Termination Screen (Quiz terminated due to violations)
  if (quizTerminated) {
    return (
      <div className="min-h-screen bg-red-50 text-slate-900 p-6">
        <div className="max-w-2xl mx-auto">
          <div className="text-center mb-8">
            <div className="w-24 h-24 bg-red-500/15 rounded-full flex items-center justify-center mx-auto mb-6">
              <ShieldX className="w-12 h-12 text-red-500" />
            </div>
            <h1 className="text-4xl font-black text-red-600 mb-2">QUIZ TERMINATED</h1>
            <div className="h-1 w-24 bg-red-500 rounded-full mx-auto"></div>
          </div>

          <div className="bg-white border-l-4 border-red-500 rounded-lg p-6 mb-8">
            <p className="text-lg font-bold text-red-700 mb-2">Integrity Violations Detected</p>
            <p className="text-red-600">You exceeded the maximum allowed violations (3 strikes).</p>
          </div>

          {violationLogs.length > 0 && (
            <div className="mb-8">
              <h2 className="text-sm font-black uppercase text-slate-700 tracking-wider mb-4 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-red-500" />
                Violations ({violationLogs.length})
              </h2>
              <div className="space-y-3 max-h-64 overflow-y-auto">
                {violationLogs.slice().reverse().map((log, idx) => (
                  <div key={idx} className="bg-white rounded-lg p-3 border border-red-200">
                    <div className="flex justify-between items-start">
                      <span className="font-semibold text-red-600 text-sm">{log.type}</span>
                      <span className="text-[9px] font-mono text-gray-500">{log.time}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4 mb-8">
            <div className="bg-white rounded-lg p-4 text-center border border-red-200">
              <div className="text-3xl font-black text-red-600">{violationLogs.length}</div>
              <div className="text-xs font-bold uppercase text-slate-600 mt-1">Violations</div>
            </div>
            <div className="bg-white rounded-lg p-4 text-center border border-red-200">
              <div className="text-3xl font-black text-slate-600">0/3</div>
              <div className="text-xs font-bold uppercase text-slate-600 mt-1">Chances</div>
            </div>
          </div>

          <div className="flex gap-4">
            <button onClick={handleBackToWorkspace} className="flex-1 bg-red-600 hover:bg-red-700 text-white font-bold py-3 px-6 rounded-xl">
              Return to Workspace
            </button>
            <button onClick={() => window.location.href = 'mailto:support@examguard.com?subject=Quiz%20Appeal'} className="flex-1 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold py-3 px-6 rounded-xl">
              Contact Support
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Results Screen
  if (showResults) {
    let correct = 0, total = 0, percentage = 0, resultsList = [];
    if (submissionResult) {
      correct = submissionResult.score;
      total = submissionResult.total;
      percentage = Math.round((correct / total) * 100);
      resultsList = submissionResult.results || [];
    } else {
      const calc = calculateScore();
      correct = calc.correct;
      total = calc.total;
      percentage = calc.percentage;
      resultsList = quizQuestions.map((q, idx) => ({
        question_id: q.id,
        is_correct: answers[idx] === q.correctAnswer,
        explanation: q.explanation || ''
      }));
    }
    const passed = percentage >= 70;

    return (
      <div className="min-h-screen bg-slate-50 text-slate-900 p-6">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold mb-2">Quiz Completed</h1>
            <p className="text-slate-600">Your assessment results are ready</p>
          </div>

          <div className="bg-white rounded-2xl p-8 text-center border border-slate-200">
            <div className={`w-24 h-24 rounded-full ${passed ? 'bg-green-100 border-2 border-green-500' : 'bg-red-100 border-2 border-red-500'} flex items-center justify-center mx-auto mb-6`}>
              {passed ? <CheckCircle className="w-12 h-12 text-green-500" /> : <X className="w-12 h-12 text-red-500" />}
            </div>

            <h2 className="text-2xl font-bold mb-2">{passed ? 'Quiz Passed' : 'Quiz Not Passed'}</h2>
            <div className="text-5xl font-bold mb-6 text-blue-600">{percentage}%</div>

            <div className="grid grid-cols-3 gap-4 mb-8">
              <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
                <div className="text-2xl font-bold text-green-600">{correct}</div>
                <div className="text-xs uppercase font-bold text-slate-500 mt-1">Correct</div>
              </div>
              <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
                <div className="text-2xl font-bold text-red-600">{total - correct}</div>
                <div className="text-xs uppercase font-bold text-slate-500 mt-1">Incorrect</div>
              </div>
              <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
                <div className="text-2xl font-bold text-blue-600">{total}</div>
                <div className="text-xs uppercase font-bold text-slate-500 mt-1">Total</div>
              </div>
            </div>

            {resultsList && (
              <div className="mb-6 text-left max-h-96 overflow-y-auto">
                <h3 className="text-lg font-bold mb-4">Question Feedback</h3>
                <ul className="space-y-3">
                  {resultsList.map((r, idx) => (
                    <li key={idx} className={`p-4 border rounded-xl ${r.is_correct ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
                      <div className="font-semibold text-sm mb-1">Q{idx + 1}: {quizQuestions[idx]?.question}</div>
                      <div className={`text-sm font-bold ${r.is_correct ? 'text-green-600' : 'text-red-600'}`}>
                        {r.is_correct ? 'Correct' : 'Incorrect'}
                      </div>
                      {r.explanation && <div className="text-xs text-slate-600 italic mt-1">{r.explanation}</div>}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <button onClick={handleBackToWorkspace} className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-8 rounded-xl">
              Back to Workspace
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Start Screen
  if (!quizStarted) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="max-w-2xl w-full">
          <div className="text-center mb-10">
            <div className="inline-block px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-xs font-bold mb-4">ExamGuard</div>
            <h1 className="text-4xl font-bold text-slate-900 mb-4">Course Assessment</h1>
            <p className="text-slate-600">Please review the instructions before starting</p>
          </div>

          <div className="bg-white border border-slate-200 rounded-3xl p-8">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
              <div>
                <h3 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
                  <PlayCircle className="w-5 h-5 text-blue-500" />
                  Quiz Info
                </h3>
                <ul className="space-y-3 text-sm text-slate-600">
                  <li className="flex items-center gap-2"><CheckCircle className="w-4 h-4 text-green-500" />{quizQuestions.length} questions</li>
                  <li className="flex items-center gap-2"><Clock className="w-4 h-4" />No time limit</li>
                  <li className="flex items-center gap-2"><CheckCircle className="w-4 h-4 text-green-500" />70% to pass</li>
                  <li className="flex items-center gap-2"><ShieldAlert className="w-4 h-4 text-red-500" />3 violation limit</li>
                </ul>
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
                  <ShieldAlert className="w-5 h-5 text-red-500" />
                  Proctoring Rules
                </h3>
                <ul className="space-y-2 text-sm text-slate-600">
                  {['Keep your face visible', 'Look at screen (3-sec gaze)', 'No devices visible', 'Stay alone'].map(rule => (
                    <li key={rule} className="flex items-start gap-2">
                      <AlertTriangle className="w-4 h-4 mt-0.5 text-yellow-500" />
                      <span>{rule}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 mb-6">
              <p className="text-sm text-yellow-700 font-medium">
                Warning: 3 chances available. At 0 chances, quiz terminates automatically.
              </p>
            </div>

            <button onClick={handleStartQuiz} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 px-6 rounded-2xl flex items-center justify-center gap-2 text-lg">
              Start Secure Quiz
              <PlayCircle className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Quiz In Progress
  if (!quizQuestions.length) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <AlertCircle className="w-12 h-12 text-slate-400 mx-auto mb-4" />
          <p className="text-slate-600">No questions available</p>
        </div>
      </div>
    );
  }

  const currentQ = quizQuestions[currentQuestion];
  const elapsed = quizStartTime ? Date.now() - quizStartTime : 0;
  const mins = Math.floor(elapsed / 60000);
  const secs = String(Math.floor((elapsed % 60000) / 1000)).padStart(2, '0');

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <div className="h-16 border-b border-slate-200 bg-white flex items-center justify-between px-6 sticky top-0 z-50">
        <div className="flex items-center gap-4">
          <div className="px-3 py-1 bg-slate-100 rounded-lg text-xs font-bold text-slate-600 uppercase tracking-wider">
            Secure Quiz
          </div>
          <h2 className="text-sm font-medium text-slate-600">
            Question {currentQuestion + 1} of {quizQuestions.length}
          </h2>
        </div>
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-slate-500" />
            <span className="text-sm font-mono text-slate-600">{mins}:{secs}</span>
          </div>
          <button onClick={() => { if (window.confirm('Exit quiz?')) handleBackToWorkspace(); }} className="text-slate-400 hover:text-slate-900">
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div className="max-w-7xl mx-auto p-6 lg:p-10">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Left: Proctoring */}
          <div className="lg:col-span-3 space-y-6">
            <ProctorFeed isProctoring={isProctoring} onFrame={sendFrame} visualization={visualization} />
            {chances < 3 && <div className="p-4 bg-red-50 border border-red-200 rounded-xl">
              <div className="text-sm font-bold text-red-600">{chances} Chances Left</div>
            </div>}
          </div>

          {/* Center: Question */}
          <div className="lg:col-span-6 space-y-6">
            <div className="bg-white rounded-xl border border-slate-200 p-8">
              <h3 className="text-xl font-bold text-slate-900 mb-6">{currentQ.question}</h3>
              <div className="space-y-3">
                {currentQ.options?.map((opt, idx) => (
                  <button key={idx} onClick={() => handleOptionSelect(currentQuestion, idx)} className={`w-full p-4 text-left rounded-lg border-2 transition-all ${answers[currentQuestion] === idx ? 'bg-blue-50 border-blue-500' : 'bg-slate-50 border-slate-200'}`}>
                    <span className="font-medium text-slate-900">{opt}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="flex gap-4 justify-between">
              <button onClick={handlePreviousQuestion} disabled={currentQuestion === 0} className="px-6 py-2 rounded-lg border border-slate-200 text-slate-700 font-medium disabled:opacity-50">
                Previous
              </button>
              <button onClick={handleNextQuestion} disabled={currentQuestion === quizQuestions.length - 1} className="px-6 py-2 rounded-lg border border-slate-200 text-slate-700 font-medium disabled:opacity-50">
                Next
              </button>
            </div>

            {currentQuestion === quizQuestions.length - 1 && (
              <button onClick={handleSubmitQuiz} disabled={isSubmitting} className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold disabled:opacity-50">
                {isSubmitting ? 'Submitting...' : 'Submit Quiz'}
              </button>
            )}
          </div>

          {/* Right: Stats */}
          <div className="lg:col-span-3">
            <ProctorStats chances={chances} violations={violationLogs} statistics={statistics} />
          </div>
        </div>
      </div>
    </div>
  );
};

export default Quiz;
