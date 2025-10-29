const Docker = require('dockerode');

const docker = new Docker({ socketPath: '/var/run/docker.sock' });

// NFS server IP (inside swarm network)
const NFS_SERVER_IP = process.env.NFS_SERVER_IP || '172.30.0.5';
const NFS_EXPORT_PATH = '/exports/student-volumes';

/**
 * Create an NFS-backed volume for a student project
 * @param {string} volumeName - Name of the volume
 * @param {string} username - Student username
 * @param {string} project - Project name
 * @returns {Promise<void>}
 */
async function createNFSVolume(volumeName, username, project) {
    try {
        // Check if volume already exists
        const vol = docker.getVolume(volumeName);
        await vol.inspect();
        console.log(`[swarm] Volume ${volumeName} already exists`);
        return;
    } catch (err) {
        // Volume doesn't exist, create it
        console.log(`[swarm] Creating NFS volume: ${volumeName}`);

        await docker.createVolume({
            Name: volumeName,
            Driver: 'local',
            DriverOpts: {
                type: 'nfs',
                o: `addr=${NFS_SERVER_IP},rw,nolock`,
                device: `:${NFS_EXPORT_PATH}/${username}/${project}`
            },
            Labels: {
                'hydra.managed_by': 'hydra-saml-auth',
                'hydra.owner': username,
                'hydra.project': project,
                'hydra.storage_type': 'nfs'
            }
        });

        console.log(`[swarm] NFS volume created: ${volumeName}`);
    }
}

/**
 * Create a Docker Swarm service for a student container
 * @param {Object} config - Service configuration
 * @returns {Promise<Object>} - Created service info
 */
async function createStudentService(config) {
    const {
        serviceName,
        image,
        username,
        project,
        volumeName,
        env = [],
        cmd,
        labels = {},
        servicePort = 8888,
        basePath,
        publicUrl,
        preset = 'jupyter',
        resources = {},
        enableGPU = true
    } = config;

    console.log(`[swarm] Creating service: ${serviceName}`);

    // Build Traefik labels for service
    const traefikLabels = {
        'traefik.enable': 'true',
        'traefik.docker.network': 'core_hydra_students',

        // Router configuration
        [`traefik.http.routers.${serviceName}.rule`]: `PathPrefix(\`${basePath}\`)`,
        [`traefik.http.routers.${serviceName}.entrypoints`]: 'web',

        // Service configuration
        [`traefik.http.services.${serviceName}.loadbalancer.server.port`]: String(servicePort),

        // ForwardAuth middleware - verify token before allowing access
        [`traefik.http.middlewares.${serviceName}-auth.forwardauth.address`]: 'http://hydra-saml-auth:6969/auth/verify',
        [`traefik.http.middlewares.${serviceName}-auth.forwardauth.trustForwardHeader`]: 'true',

        // Attach auth middleware
        [`traefik.http.routers.${serviceName}.middlewares`]: `${serviceName}-auth`,

        ...labels
    };

    // Hydra management labels
    const managementLabels = {
        'hydra.managed_by': 'hydra-saml-auth',
        'hydra.owner': username,
        'hydra.project': project,
        'hydra.preset': preset,
        'hydra.basePath': basePath,
        'hydra.public_url': publicUrl,
        'hydra.created_at': new Date().toISOString(),
        ...traefikLabels
    };

    // Build resource limits
    const resourceLimits = {
        Limits: {
            NanoCPUs: resources.maxCpus ? Math.floor(Number(resources.maxCpus) * 1e9) : 2 * 1e9, // 2 CPUs default
            MemoryBytes: resources.maxMemMB ? resources.maxMemMB * 1024 * 1024 : 4 * 1024 * 1024 * 1024 // 4GB default
        },
        Reservations: {
            NanoCPUs: resources.minCpus ? Math.floor(Number(resources.minCpus) * 1e9) : 5e8, // 0.5 CPU default
            MemoryBytes: resources.minMemMB ? resources.minMemMB * 1024 * 1024 : 1 * 1024 * 1024 * 1024 // 1GB default
        }
    };

    // Add GPU reservation if enabled
    // NOTE: In dev environment (DinD), nodes don't have GPU GenericResources registered.
    // Only enable this in production with properly configured NVIDIA Docker runtime.
    const enableGPUResources = process.env.SWARM_ENABLE_GPU_RESOURCES === 'true';
    if (enableGPU && enableGPUResources) {
        resourceLimits.Reservations.GenericResources = [{
            DiscreteResourceSpec: {
                Kind: 'NVIDIA-GPU',
                Value: 1
            }
        }];
        console.log('[swarm] GPU resource reservation enabled');
    } else if (enableGPU) {
        console.log('[swarm] GPU placement enabled (without resource reservation for dev)');
    }

    // Build service spec
    const serviceSpec = {
        Name: serviceName,
        TaskTemplate: {
            ContainerSpec: {
                Image: image,
                Env: env,
                Labels: managementLabels,
                Mounts: [{
                    Type: 'volume',
                    Source: volumeName,
                    Target: preset === 'jupyter' ? '/home/jovyan/work' : '/workspace'
                }]
            },
            Resources: resourceLimits,
            RestartPolicy: {
                Condition: 'on-failure',
                Delay: 5000000000, // 5 seconds in nanoseconds
                MaxAttempts: 3
            },
            Placement: {
                Constraints: [
                    // Run on GPU-enabled worker nodes
                    'node.labels.gpu==true'
                ],
                Preferences: [
                    {
                        Spread: {
                            SpreadDescriptor: 'node.labels.workload'
                        }
                    }
                ]
            },
            Networks: [
                { Target: 'core_hydra_students' }
            ]
        },
        Mode: {
            Replicated: {
                Replicas: 1
            }
        },
        Labels: managementLabels,
        EndpointSpec: {
            // Services are accessed through Traefik, no port publishing needed
        }
    };

    // Add command if specified
    if (cmd) {
        serviceSpec.TaskTemplate.ContainerSpec.Command = cmd;
    }

    // Create the service
    const service = await docker.createService(serviceSpec);

    console.log(`[swarm] Service created: ${serviceName} (ID: ${service.id})`);

    return {
        id: service.id,
        name: serviceName,
        url: publicUrl
    };
}

/**
 * List services owned by a user
 * @param {string} username - Username
 * @returns {Promise<Array>} - Array of service info
 */
async function listUserServices(username) {
    const services = await docker.listServices({
        filters: {
            label: [
                `hydra.owner=${username}`,
                'hydra.managed_by=hydra-saml-auth'
            ]
        }
    });

    return Promise.all(services.map(async (svc) => {
        const spec = svc.Spec;
        const labels = spec.Labels || {};

        // Get service tasks to determine status
        const tasks = await docker.listTasks({
            filters: {
                service: [svc.ID]
            }
        });

        const runningTasks = tasks.filter(t => t.Status.State === 'running').length;
        const desiredReplicas = spec.Mode.Replicated?.Replicas || 0;

        return {
            id: svc.ID,
            name: spec.Name,
            image: spec.TaskTemplate.ContainerSpec.Image,
            state: runningTasks > 0 ? 'running' : 'pending',
            replicas: `${runningTasks}/${desiredReplicas}`,
            created: svc.CreatedAt,
            updated: svc.UpdatedAt,
            project: labels['hydra.project'] || '',
            preset: labels['hydra.preset'] || '',
            url: labels['hydra.public_url'] || '',
            basePath: labels['hydra.basePath'] || ''
        };
    }));
}

/**
 * Get a service by name
 * @param {string} serviceName - Service name
 * @returns {Promise<Object>} - Service object
 */
async function getService(serviceName) {
    return docker.getService(serviceName);
}

/**
 * Delete a service
 * @param {string} serviceName - Service name
 * @param {string} username - Username (for authorization check)
 * @returns {Promise<void>}
 */
async function deleteService(serviceName, username) {
    const service = await getService(serviceName);
    const info = await service.inspect();
    const labels = info.Spec.Labels || {};

    // Verify ownership
    if (labels['hydra.owner'] !== username || labels['hydra.managed_by'] !== 'hydra-saml-auth') {
        throw new Error('Not authorized to delete this service');
    }

    console.log(`[swarm] Deleting service: ${serviceName}`);
    await service.remove();
}

/**
 * Update a service (e.g., for rolling updates)
 * @param {string} serviceName - Service name
 * @param {Object} updateSpec - Service update specification
 * @returns {Promise<void>}
 */
async function updateService(serviceName, updateSpec) {
    const service = await getService(serviceName);
    const currentSpec = await service.inspect();

    await service.update({
        version: currentSpec.Version.Index,
        ...updateSpec
    });

    console.log(`[swarm] Service updated: ${serviceName}`);
}

/**
 * Get service logs
 * @param {string} serviceName - Service name
 * @param {Object} options - Log options (tail, follow, etc.)
 * @returns {Promise<Stream>} - Log stream
 */
async function getServiceLogs(serviceName, options = {}) {
    const service = await getService(serviceName);
    return service.logs({
        stdout: true,
        stderr: true,
        tail: options.tail || 100,
        follow: options.follow || false,
        timestamps: options.timestamps || false
    });
}

/**
 * Check if Swarm is active
 * @returns {Promise<boolean>}
 */
async function isSwarmActive() {
    try {
        const info = await docker.swarmInspect();
        return info && info.ID;
    } catch (err) {
        return false;
    }
}

module.exports = {
    createNFSVolume,
    createStudentService,
    listUserServices,
    getService,
    deleteService,
    updateService,
    getServiceLogs,
    isSwarmActive
};
