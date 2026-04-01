// services/api.js
const API_BASE_URL = 'http://localhost:8000';

let _csrf = null;

const fetchCsrf = async () => {
    if (_csrf) return _csrf;
    const res = await fetch(`${API_BASE_URL}/session/csrf`, { credentials: 'include' });
    if (!res.ok) throw new Error('Failed to fetch CSRF token');
    const data = await res.json();
    _csrf = data.csrf_token;
    return _csrf;
};

const apiRequest = async (endpoint, options = {}) => {
    try {
        const headers = {
            'Content-Type': 'application/json',
            ...options.headers,
        };

        const opts = {
            credentials: 'include',
            headers,
            ...options,
        };

        // CSRF header for state-changing requests
        if (opts.method && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(opts.method.toUpperCase())) {
            const path = endpoint.split('?')[0];
            const skipCsrf = path.startsWith('/login')
                || path.startsWith('/signup')
                || path.startsWith('/auth/google');
            if (!skipCsrf) {
                try {
                    const token = await fetchCsrf();
                    opts.headers['X-CSRF-Token'] = token;
                } catch {
                    console.warn('Could not fetch CSRF token — continuing without it');
                }
            }
        }

        const response = await fetch(`${API_BASE_URL}${endpoint}`, opts);

        if (!response.ok) {
            let errorDetail = `API error: ${response.status}`;
            try {
                const errorData = await response.json();
                const errorMessage = typeof errorData === 'object'
                    ? (errorData.detail
                        ? (Array.isArray(errorData.detail)
                            ? errorData.detail.map(e => e.msg).join(', ')
                            : errorData.detail)
                        : JSON.stringify(errorData))
                    : errorData;
                errorDetail = errorMessage || errorDetail;
            } catch {
                errorDetail = response.statusText || errorDetail;
            }
            throw new Error(errorDetail);
        }

        const contentType = response.headers.get('content-type');
        if (!contentType || !contentType.includes('application/json')) {
            return { success: true };
        }

        return await response.json();
    } catch (error) {
        console.error('API request failed:', error);
        throw error;
    }
};

// ── Auth API ─────────────────────────────────────────────────────────────────
export const authAPI = {
    login: async (email, password) => {
        const data = await apiRequest('/login', {
            method: 'POST',
            body: JSON.stringify({ email, password }),
        });
        if (data) {
            const u = data.user
                ? data.user
                : {
                    id: data.id || data._id,
                    email: data.email || email,
                    role: data.role,
                    is_admin: data.is_admin,
                    name: data.name || data.username,
                };
            sessionStorage.setItem('user', JSON.stringify(u));
        }
        _csrf = null;
        return data;
    },

    register: async (userData) => {
        return await apiRequest('/signup', {
            method: 'POST',
            body: JSON.stringify(userData),
        });
    },

    logout: async () => {
        try {
            await apiRequest('/logout', { method: 'POST' });
        } finally {
            sessionStorage.removeItem('user');
            _csrf = null;
        }
    },

    getCurrentUser: async () => {
        return await apiRequest('/me');
    },
};

// ── Project / Quiz API ────────────────────────────────────────────────────────
export const projectAPI = {
    generateQuiz: async (topic) =>
        apiRequest('/api/generate-quiz', {
            method: 'POST',
            body: JSON.stringify({ topic }),
        }),

    submitQuiz: async (quizId, userAnswers) =>
        apiRequest('/api/quiz/submit', {
            method: 'POST',
            body: JSON.stringify({ quiz_id: quizId, user_answers: userAnswers }),
        }),
};