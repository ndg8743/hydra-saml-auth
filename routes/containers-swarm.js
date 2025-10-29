const express = require('express');
const Docker = require('dockerode');
const swarmHelper = require('../lib/swarm-helper');

const router = express.Router();
const docker = new Docker({ socketPath: '/var/run/docker.sock' });

// Helper to pull Docker images
async function pullImage(img) {
    return new Promise((resolve, reject) => {
        docker.pull(img, (err, stream) => {
            if (err) return reject(err);
            docker.modem.followProgress(stream, (err2) => (err2 ? reject(err2) : resolve()));
        });
    });
}

// Start a Jupyter container as a Swarm service with GPU support
// POST /dashboard/api/containers/start { project, preset: 'jupyter', resources? }
router.post('/start', async (req, res) => {
    try {
        if (!req.isAuthenticated?.() || !req.user?.email) {
            return res.status(401).json({ success: false, message: 'Not authenticated' });
        }

        const project = String(req.body?.project || '').trim().toLowerCase();
        if (!project || !/^[a-z0-9-]{1,40}$/.test(project)) {
            return res.status(400).json({ success: false, message: 'Invalid project name' });
        }

        const preset = String(req.body?.preset || '').trim();
        const limits = req.body?.resources || {};
        const enableGPU = req.body?.enableGPU !== false; // GPU enabled by default

        const username = String(req.user.email).split('@')[0];
        const host = process.env.BASE_URL?.replace(/^https?:\/\//, '') || 'hydra.local';
        const basePath = `/students/${username}/${project}`;
        const serviceName = `student-${username}-${project}`;

        // Public URL
        const publicBase = (process.env.PUBLIC_STUDENTS_BASE || `http://${host}/students`).replace(/\/$/, '');
        const publicUrl = `${publicBase}/${username}/${project}/`;

        // Check if Swarm is active
        const isSwarm = await swarmHelper.isSwarmActive();
        if (!isSwarm) {
            return res.status(503).json({
                success: false,
                message: 'Docker Swarm is not active. Cannot create student containers.'
            });
        }

        // === JUPYTER NOTEBOOK (Swarm Service with GPU) ===
        if (preset === 'jupyter') {
            const image = process.env.JUPYTER_IMAGE || 'jupyter/tensorflow-notebook:latest';
            const servicePort = 8888;

            // Volume name
            const volumeName = `student-${username}-${project}`;

            // Create NFS-backed volume
            await swarmHelper.createNFSVolume(volumeName, username, project);

            // Pull image first
            console.log(`[containers] Pulling image: ${image}`);
            await pullImage(image);

            // Jupyter command to start with base URL and no auth (ForwardAuth handles it)
            const cmd = [
                'start-notebook.sh',
                `--NotebookApp.base_url=${basePath}`,
                '--NotebookApp.allow_origin=*',
                '--NotebookApp.token=',
                '--NotebookApp.password='
            ];

            // Resource limits
            const resources = {
                maxCpus: limits.cpus || 2,
                maxMemMB: limits.memMB || 4096,
                minCpus: 0.5,
                minMemMB: 1024
            };

            // Create service
            const serviceInfo = await swarmHelper.createStudentService({
                serviceName,
                image,
                username,
                project,
                volumeName,
                cmd,
                servicePort,
                basePath,
                publicUrl,
                preset: 'jupyter',
                resources,
                enableGPU
            });

            return res.json({
                success: true,
                url: publicUrl,
                name: serviceName,
                type: 'swarm-service',
                gpu: enableGPU
            });
        }

        return res.status(400).json({
            success: false,
            message: 'Only jupyter preset is currently supported in Swarm mode'
        });

    } catch (err) {
        console.error('[containers] start error:', err);
        return res.status(500).json({ success: false, message: err.message || 'Failed to start container' });
    }
});

// List current user's services
router.get('/mine', async (req, res) => {
    try {
        if (!req.isAuthenticated?.() || !req.user?.email) {
            return res.status(401).json({ success: false, message: 'Not authenticated' });
        }
        const username = String(req.user.email).split('@')[0];

        // Check if Swarm is active
        const isSwarm = await swarmHelper.isSwarmActive();
        if (!isSwarm) {
            return res.json({ success: true, containers: [], vscode: null });
        }

        // List user's services
        const services = await swarmHelper.listUserServices(username);

        const items = services.map(svc => ({
            id: svc.id,
            name: svc.name,
            image: svc.image,
            state: svc.state,
            status: `${svc.replicas} replicas`,
            created: svc.created,
            project: svc.project,
            url: svc.url,
            preset: svc.preset,
            type: 'swarm-service'
        }));

        return res.json({ success: true, containers: items, vscode: null });
    } catch (err) {
        console.error('[containers] list mine error:', err);
        return res.status(500).json({ success: false, message: 'Failed to list containers' });
    }
});

// Delete a user's service
router.delete('/:name', async (req, res) => {
    try {
        if (!req.isAuthenticated?.() || !req.user?.email) {
            return res.status(401).json({ success: false, message: 'Not authenticated' });
        }
        const username = String(req.user.email).split('@')[0];
        const nameParam = String(req.params.name || '').trim();
        if (!nameParam) return res.status(400).json({ success: false, message: 'Missing service name' });

        // Check if Swarm is active
        const isSwarm = await swarmHelper.isSwarmActive();
        if (!isSwarm) {
            return res.status(503).json({ success: false, message: 'Docker Swarm is not active' });
        }

        await swarmHelper.deleteService(nameParam, username);
        return res.json({ success: true });
    } catch (err) {
        console.error('[containers] delete error:', err);
        if (err.message === 'Not authorized to delete this service') {
            return res.status(403).json({ success: false, message: err.message });
        }
        return res.status(500).json({ success: false, message: 'Failed to delete service' });
    }
});

// Stream logs (SSE) for a service
router.get('/:name/logs/stream', async (req, res) => {
    try {
        if (!req.isAuthenticated?.() || !req.user?.email) {
            return res.status(401).end();
        }
        const username = String(req.user.email).split('@')[0];
        const nameParam = String(req.params.name || '').trim();
        if (!nameParam) return res.status(400).end();

        // Verify ownership
        const service = await swarmHelper.getService(nameParam);
        const info = await service.inspect();
        const labels = info.Spec.Labels || {};
        if (labels['hydra.owner'] !== username || labels['hydra.managed_by'] !== 'hydra-saml-auth') {
            return res.status(403).end();
        }

        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');

        const logStream = await swarmHelper.getServiceLogs(nameParam, {
            follow: true,
            tail: 200
        });

        // Use demuxStream to properly handle Docker's multiplexed stream
        const stdout = {
            write: (chunk) => {
                const lines = chunk.toString('utf8').split(/\r?\n/);
                lines.forEach(line => {
                    if (line) res.write(`data: ${line}\n\n`);
                });
            }
        };
        const stderr = {
            write: (chunk) => {
                const lines = chunk.toString('utf8').split(/\r?\n/);
                lines.forEach(line => {
                    if (line) res.write(`data: [stderr] ${line}\n\n`);
                });
            }
        };

        docker.modem.demuxStream(logStream, stdout, stderr);

        logStream.on('end', () => res.end());
        logStream.on('error', () => res.end());
        req.on('close', () => {
            try { logStream.destroy(); } catch { }
        });
    } catch (err) {
        console.error('[containers] logs stream error:', err);
        try { res.status(500).end(); } catch { }
    }
});

// Restart a service (update with force flag)
router.post('/:name/restart', async (req, res) => {
    try {
        if (!req.isAuthenticated?.() || !req.user?.email) {
            return res.status(401).json({ success: false, message: 'Not authenticated' });
        }
        const username = String(req.user.email).split('@')[0];
        const nameParam = String(req.params.name || '').trim();
        if (!nameParam) return res.status(400).json({ success: false, message: 'Missing service name' });

        // Verify ownership
        const service = await swarmHelper.getService(nameParam);
        const info = await service.inspect();
        const labels = info.Spec.Labels || {};
        if (labels['hydra.owner'] !== username || labels['hydra.managed_by'] !== 'hydra-saml-auth') {
            return res.status(403).json({ success: false, message: 'Not allowed' });
        }

        // Force update to restart service
        await service.update({
            version: info.Version.Index,
            ...info.Spec,
            TaskTemplate: {
                ...info.Spec.TaskTemplate,
                ForceUpdate: (info.Spec.TaskTemplate.ForceUpdate || 0) + 1
            }
        });

        return res.json({ success: true });
    } catch (err) {
        console.error('[containers] restart error:', err);
        return res.status(500).json({ success: false, message: 'Failed to restart service' });
    }
});

module.exports = router;
