import express, { json, NextFunction, Request, Response } from 'express';
import assert from 'node:assert/strict';
import http from 'node:http';
import { AddressInfo } from 'node:net';

import { UnauthorizedException } from '@nestjs/common';

import {
    bodySizeLimitMiddleware,
    preParseAuthMiddleware,
} from '../src/common/middlewares/pre-parse-auth.middleware';

// Mirrors the tail of registerHttpPipeline (src/common/utils/startup-app/http-pipeline.ts).
const AUTH_BODY_LIMIT_BYTES = 64 * 1024;
const VALID_TOKEN = 'Bearer valid';

let authCalls = 0;
let parsedBytes = 0;

const fakeAuthService = {
    authenticate: async (req: Request) => {
        authCalls++;
        if (req.headers.authorization !== VALID_TOKEN) {
            throw new UnauthorizedException();
        }
        return {};
    },
};

const app = express();

app.use(
    preParseAuthMiddleware(fakeAuthService as never, [
        '/api/auth',
        '/api/sub',
        '/api/backend-tools',
    ]),
);
app.use('/api/sub', bodySizeLimitMiddleware(0));
app.use('/api/sub', json({ limit: 0, inflate: false }));
app.use('/api/auth', bodySizeLimitMiddleware(AUTH_BODY_LIMIT_BYTES));
app.use('/api/auth', json({ limit: AUTH_BODY_LIMIT_BYTES, inflate: false }));
app.use(json({ limit: '100mb', inflate: false }));
app.use((req: Request, res: Response) => {
    const size = req.body ? JSON.stringify(req.body).length : 0;
    parsedBytes += size;
    res.json({ ok: true, size });
});
app.use((err: { status?: number }, _req: Request, res: Response, _next: NextFunction) => {
    res.status(err.status ?? 500).json({ error: true });
});

type TResult = { status: number; connection: string | undefined };

function request(
    port: number,
    opts: {
        method: string;
        path: string;
        headers?: Record<string, string>;
        body?: string;
        chunked?: boolean;
    },
): Promise<TResult> {
    return new Promise((resolve, reject) => {
        const headers: Record<string, string> = { ...opts.headers };
        if (opts.body !== undefined) {
            headers['content-type'] = 'application/json';
            if (opts.chunked) {
                headers['transfer-encoding'] = 'chunked';
            } else {
                headers['content-length'] = String(Buffer.byteLength(opts.body));
            }
        }

        const req = http.request(
            { host: '127.0.0.1', port, method: opts.method, path: opts.path, headers },
            (res) => {
                res.resume();
                res.on('end', () =>
                    resolve({
                        status: res.statusCode ?? 0,
                        connection: res.headers.connection,
                    }),
                );
            },
        );
        // The server may close the socket while a rejected body is still being sent.
        req.on('error', (error: NodeJS.ErrnoException) => {
            if (error.code === 'EPIPE' || error.code === 'ECONNRESET') return;
            reject(error);
        });
        if (opts.body !== undefined) req.write(opts.body);
        req.end();
    });
}

function jsonBody(bytes: number): string {
    return JSON.stringify({ a: 'x'.repeat(bytes) });
}

async function main(): Promise<void> {
    const server = app.listen(0, '127.0.0.1');
    await new Promise((resolve) => server.once('listening', resolve));
    const { port } = server.address() as AddressInfo;

    try {
        // Unauthenticated large body is rejected before it is parsed.
        parsedBytes = 0;
        let res = await request(port, {
            method: 'POST',
            path: '/api/users',
            body: jsonBody(5 * 1024 * 1024),
        });
        assert.equal(res.status, 401);
        assert.equal(res.connection, 'close');
        assert.equal(parsedBytes, 0);

        // Same with a chunked body (no content-length to inspect).
        res = await request(port, {
            method: 'POST',
            path: '/api/users',
            body: jsonBody(1024),
            chunked: true,
        });
        assert.equal(res.status, 401);
        assert.equal(res.connection, 'close');
        assert.equal(parsedBytes, 0);

        // Invalid token behaves like no token.
        res = await request(port, {
            method: 'POST',
            path: '/api/users',
            headers: { authorization: 'Bearer nope' },
            body: jsonBody(1024),
        });
        assert.equal(res.status, 401);
        assert.equal(parsedBytes, 0);

        // Authenticated large body still goes through.
        res = await request(port, {
            method: 'POST',
            path: '/api/users',
            headers: { authorization: VALID_TOKEN },
            body: jsonBody(5 * 1024 * 1024),
        });
        assert.equal(res.status, 200);
        assert.ok(parsedBytes > 5 * 1024 * 1024);

        // Requests without a body are left to the route guards.
        authCalls = 0;
        res = await request(port, { method: 'GET', path: '/api/users' });
        assert.equal(res.status, 200);
        assert.equal(authCalls, 0);

        // Auth routes are public but capped at 64 KiB.
        res = await request(port, {
            method: 'POST',
            path: '/api/auth/login',
            body: jsonBody(1024),
        });
        assert.equal(res.status, 200);
        assert.equal(authCalls, 0);

        res = await request(port, {
            method: 'POST',
            path: '/api/AUTH/login',
            body: jsonBody(128 * 1024),
        });
        assert.equal(res.status, 413);

        // A path that merely starts with a public prefix is not public.
        res = await request(port, {
            method: 'POST',
            path: '/api/authx',
            body: jsonBody(1024),
        });
        assert.equal(res.status, 401);

        // Subscription routes accept no body at all.
        res = await request(port, {
            method: 'POST',
            path: '/api/sub/abc',
            body: jsonBody(16),
        });
        assert.equal(res.status, 413);

        res = await request(port, { method: 'GET', path: '/api/sub/abc' });
        assert.equal(res.status, 200);

        console.log('pre-parse auth tests passed');
    } finally {
        server.closeAllConnections();
        server.close();
    }
}

void main();
