const express = require('express');
const jwt = require('jsonwebtoken');
const config = require('../config.js');
const { asyncHandler } = require('../endpointHelper.js');
const { Role, DB } = require('../database/database.js');
const metrics = require('../metrics.js');

const authRouter = express.Router();
const MAX_LOGIN_ATTEMPTS = 5;
const LOGIN_ATTEMPT_WINDOW_MS = metrics.AUTHENTICATION_WINDOW_MS;
const LOGIN_LOCKOUT_MS = metrics.AUTHENTICATION_WINDOW_MS;
const loginAttemptState = new Map();

authRouter.docs = [
    {
        method: 'POST',
        path: '/api/auth',
        description: 'Register a new user',
        example: `curl -X POST localhost:3000/api/auth -d '{"name":"pizza diner", "email":"d@jwt.com", "password":"diner"}' -H 'Content-Type: application/json'`,
        response: {
            user: { id: 2, name: 'pizza diner', email: 'd@jwt.com', roles: [{ role: 'diner' }] },
            token: 'tttttt',
        },
    },
    {
        method: 'PUT',
        path: '/api/auth',
        description: 'Login existing user',
        example: `curl -X PUT localhost:3000/api/auth -d '{"email":"a@jwt.com", "password":"admin"}' -H 'Content-Type: application/json'`,
        response: {
            user: { id: 1, name: '常用名字', email: 'a@jwt.com', roles: [{ role: 'admin' }] },
            token: 'tttttt',
        },
    },
    {
        method: 'DELETE',
        path: '/api/auth',
        requiresAuth: true,
        description: 'Logout a user',
        example: `curl -X DELETE localhost:3000/api/auth -H 'Authorization: Bearer tttttt'`,
        response: { message: 'logout successful' },
    },
];

async function setAuthUser(req, res, next) {
    const token = readAuthToken(req);
    if (token) {
        try {
            if (await DB.isLoggedIn(token)) {
                // Check the database to make sure the token is valid.
                req.user = jwt.verify(token, config.jwtSecret);
                req.user.isRole = (role) => !!req.user.roles.find((r) => r.role === role);
            }
        } catch {
            req.user = null;
        }
    }
    next();
}

// Authenticate token
authRouter.authenticateToken = (req, res, next) => {
    if (!req.user) {
        return res.status(401).send({ message: 'unauthorized' });
    }
    next();
};

// register
authRouter.post(
    '/',
    asyncHandler(async (req, res) => {
        const { name, email, password } = req.body;
        if (!name || !email || !password) {
            return res.status(400).json({ message: 'name, email, and password are required' });
        }
        const user = await DB.addUser({ name, email, password, roles: [{ role: Role.Diner }] });
        const auth = await setAuth(user);
        res.json({ user: user, token: auth });
    })
);

// login
authRouter.put(
    '/',
    asyncHandler(async (req, res) => {
        const { email, password } = req.body;
        if (!email || !password) {
            metrics.recordFailedAuthentication();
            return res.status(400).json({ message: 'email and password are required' });
        }

        const attemptKey = getLoginAttemptKey(req, email);
        if (isLoginBlocked(attemptKey)) {
            metrics.recordFailedAuthentication();
            return res.status(429).json({ message: 'too many login attempts' });
        }

        let user;
        try {
            user = await DB.getUser(email, password);
        } catch (err) {
            if (err.statusCode === 404) {
                recordFailedLoginAttempt(attemptKey);
                metrics.recordFailedAuthentication();
                return res.status(401).json({ message: 'unauthorized' });
            }
            throw err;
        }
        clearLoginAttemptState(attemptKey);
        const auth = await setAuth(user);
        metrics.recordSuccessfulAuthentication();
        res.json({ user: user, token: auth });
    })
);

// logout
authRouter.delete(
    '/',
    authRouter.authenticateToken,
    asyncHandler(async (req, res) => {
        await clearAuth(req);
        res.json({ message: 'logout successful' });
    })
);

async function setAuth(user) {
    const token = jwt.sign(user, config.jwtSecret);
    await DB.loginUser(user.id, token);
    return token;
}

async function clearAuth(req) {
    const token = readAuthToken(req);
    if (token) {
        await DB.logoutUser(token);
    }
}

function readAuthToken(req) {
    const authHeader = req.headers.authorization;
    if (authHeader) {
        return authHeader.split(' ')[1];
    }
    return null;
}

function getLoginAttemptKey(req, email) {
    const forwardedForHeader = req.headers['x-forwarded-for'];
    const forwardedFor = Array.isArray(forwardedForHeader)
        ? forwardedForHeader[0]
        : forwardedForHeader;
    const clientIp = String(forwardedFor || req.ip || '').split(',')[0].trim();
    return `${String(email).toLowerCase()}|${clientIp}`;
}

function isLoginBlocked(attemptKey, now = Date.now()) {
    const attempt = loginAttemptState.get(attemptKey);
    if (!attempt) {
        return false;
    }

    if (attempt.blockedUntil > now) {
        return true;
    }

    if (now - attempt.windowStart > LOGIN_ATTEMPT_WINDOW_MS) {
        loginAttemptState.delete(attemptKey);
    }
    return false;
}

function recordFailedLoginAttempt(attemptKey, now = Date.now()) {
    const current = loginAttemptState.get(attemptKey);
    if (!current || now - current.windowStart > LOGIN_ATTEMPT_WINDOW_MS) {
        loginAttemptState.set(attemptKey, {
            failedCount: 1,
            windowStart: now,
            blockedUntil: 0,
        });
        return;
    }

    const failedCount = current.failedCount + 1;
    const blockedUntil =
        failedCount >= MAX_LOGIN_ATTEMPTS ? now + LOGIN_LOCKOUT_MS : current.blockedUntil;

    loginAttemptState.set(attemptKey, {
        ...current,
        failedCount,
        blockedUntil,
    });
}

function clearLoginAttemptState(attemptKey) {
    loginAttemptState.delete(attemptKey);
}

function clearAllLoginAttemptState() {
    loginAttemptState.clear();
}

module.exports = {
    authRouter,
    setAuthUser,
    setAuth,
    clearAllLoginAttemptState,
};
