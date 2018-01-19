const fs = require('fs');
const crypto = require('crypto');
const http = require('http');
const bl = require('bl');
const snekfetch = require('snekfetch');

// Load config and build list of refs to block
const config = JSON.parse(fs.readFileSync('./config.json', 'utf8'));
const refs = {};
for(const [repo, branches] of Object.entries(config.blacklist)) refs[repo] = branches.map(b => `refs/heads/${b}`);

http.createServer((req, res) => {
	// Make sure all headers are present
	const signature = req.headers['x-hub-signature'];
	const event = req.headers['x-github-event'];
	const id = req.headers['x-github-delivery'];
	if(!signature || !event || !id) {
		res.writeHead(400, { 'Content-type': 'application/json' });
		res.end('{"error":"Invalid request headers."}');
		return;
	}

	req.pipe(bl(async(err, data) => {
		// Handle unknown errors
		if(err) {
			res.writeHead(400, { 'Content-type': 'application/json' });
			res.end(JSON.stringify({ error: err.message }));
			return;
		}

		// Make sure the request isn't too large
		if(data.length > 20480) {
			res.writeHead(400, { 'Content-type': 'application/json' });
			res.end('{"error":"Request too large."}');
			return;
		}

		// Verify the secret
		const secret = `sha1=${crypto.createHmac('sha1', config.secret).update(data).digest('hex')}`;
		if(!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(secret))) {
			res.writeHead(400, { 'Content-type': 'application/json' });
			res.end('{"error":"Invalid secret."}');
			return;
		}

		// Parse the data
		let payload;
		try {
			payload = JSON.parse(data.toString());
		} catch(err2) {
			res.writeHead(400, { 'Content-type': 'application/json' });
			res.end(JSON.stringify({ error: err2.message }));
			return;
		}

		// Ignore the event if it's for a push to a blacklisted repo/branch combo
		const repo = payload.repository && payload.ref ? payload.repository.full_name : null;
		if(event === 'push' && repo && refs[repo]) {
			if(refs[repo].includes(payload.ref)) {
				console.log(`Skipping ${event} event for ${repo}#${payload.ref}: ${payload.after}`);
				res.writeHead(200, { 'Content-type': 'application/json' });
				res.end('{"message":"Skipped event for blacklisted repository/branch."}');
				return;
			}
		}

		// Forward event to Discord's webhook
		try {
			await snekfetch.post(config.webhook, {
				data: payload,
				headers: {
					'content-type': 'application/json',
					'x-github-event': event,
					'x-github-delivery': id
				}
			});
		} catch(err2) {
			console.error('Error while forwarding event to Discord:', err2);
			res.writeHead(500, { 'Content-type': 'application/json' });
			res.end(JSON.stringify({ error: err2.message }));
			return;
		}

		res.statusCode = 204;
		res.end();
	}));
}).listen(1337, err => {
	if(err) console.error('Error starting HTTP server:', err);
	else console.log('Listening on port 1337.');
});

process.on('unhandledRejection', err => {
	console.error('Unhandled Promise rejection:', err);
});
