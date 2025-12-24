// Script to verify MCP server is working, requires app to be up and running
// Usage: bun scripts/verify-mcp.ts <AUTH_TOKEN>
const BUNDLE_PORT = process.env.PORT || '5000'; // Using the inspector port from the logs
const AUTH_TOKEN = process.argv[2];

if (!AUTH_TOKEN) {
    console.error('Usage: bun scripts/verify-mcp.ts <AUTH_TOKEN>');
    process.exit(1);
}

const BASE_URL = `http://localhost:${BUNDLE_PORT}/mcp`;

async function verify() {
    console.log('1. Initializing MCP session...');
    const initRes = await fetch(BASE_URL, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${AUTH_TOKEN}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json, text/event-stream'
        },
        body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'initialize',
            params: {
                protocolVersion: '2024-11-05',
                capabilities: {},
                clientInfo: { name: 'verify-script', version: '1.0.0' }
            }
        })
    });

    if (!initRes.ok) {
        console.error('Initialize failed:', initRes.status, await initRes.text());
        return;
    }

    const sessionId = initRes.headers.get('mcp-session-id');
    console.log('Session ID:', sessionId);

    if (!sessionId) {
        console.error('No session ID returned in headers');
        return;
    }

    console.log('2. Establishing SSE stream via query param...');
    const sseRes = await fetch(`${BASE_URL}?sessionId=${sessionId}`, {
        headers: {
            'Authorization': `Bearer ${AUTH_TOKEN}`,
            'Accept': 'text/event-stream'
        }
    });

    if (!sseRes.ok) {
        console.error('SSE failed:', sseRes.status, await sseRes.text());
        return;
    }
    console.log('SSE headers OK:', sseRes.headers.get('content-type'));

    console.log('3. Sending notifications/initialized...');
    const initNotifyRes = await fetch(`${BASE_URL}?sessionId=${sessionId}`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${AUTH_TOKEN}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json, text/event-stream'
        },
        body: JSON.stringify({
            jsonrpc: '2.0',
            method: 'notifications/initialized',
            params: {}
        })
    });

    if (!initNotifyRes.ok) {
        console.error('Init notify failed:', initNotifyRes.status, await initNotifyRes.text());
    }

    console.log('4. Listing tools via query param...');
    const listToolsRes = await fetch(`${BASE_URL}?sessionId=${sessionId}`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${AUTH_TOKEN}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json, text/event-stream'
        },
        body: JSON.stringify({
            jsonrpc: '2.0',
            id: 3,
            method: 'tools/list',
            params: {}
        })
    });

    const bodyText = await listToolsRes.text();
    console.log('Response status:', listToolsRes.status);
    console.log('Response headers Content-Type:', listToolsRes.headers.get('content-type'));

    if (!listToolsRes.ok) {
        console.error('List tools failed:', listToolsRes.status, bodyText);
        return;
    }

    if (!bodyText) {
        console.error('Empty response body');
        return;
    }

    try {
        let jsonToParse = bodyText;
        // Handle SSE formatting if present
        if (bodyText.includes('event: message') && bodyText.includes('data: ')) {
            const match = bodyText.match(/data: (.*)/);
            if (match) {
                jsonToParse = match[1];
            }
        }

        const result = JSON.parse(jsonToParse);
        if (result.error) {
            console.error('List tools returned error:', JSON.stringify(result.error));
        } else {
            console.log('Successfully retrieved tools:', result.result?.tools?.length ?? 0);
            if (result.result?.tools?.length > 0) {
                console.log('Verification PASSED');
            } else {
                console.warn('No tools returned, but request succeeded');
                console.log('Verification PASSED (Status only)');
            }
        }
    } catch (e) {
        console.error('Failed to parse JSON:', e);
        console.log('Body was:', bodyText);
    }
}

verify().catch(console.error);
