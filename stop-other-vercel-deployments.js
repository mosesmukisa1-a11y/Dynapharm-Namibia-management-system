#!/usr/bin/env node

/**
 * Script to stop/remove all Vercel deployments except the correct one
 * Correct deployment: dynapharm-namibia-management-system-pi
 * 
 * Usage:
 *   1. Get Vercel token from: https://vercel.com/account/tokens
 *   2. Set environment variable: export VERCEL_TOKEN=your_token
 *   3. Run: node stop-other-vercel-deployments.js
 * 
 * Or use with CLI after login:
 *   vercel projects list
 *   vercel projects rm <project-id>
 */

import https from 'https';
import readline from 'readline';

const TEAM_ID = 'team_qFWDX1wCnfnvezFivR8cUUZA';
const CORRECT_PROJECT_NAME = 'dynapharm-namibia-management-system-pi';
const VERCEL_API = 'https://api.vercel.com';

// Get Vercel token from environment or prompt
const VERCEL_TOKEN = process.env.VERCEL_TOKEN || process.env.VERCEL_AUTH_TOKEN;

if (!VERCEL_TOKEN) {
    console.error('❌ VERCEL_TOKEN not found in environment variables');
    console.error('💡 Get your token from: https://vercel.com/account/tokens');
    console.error('💡 Then run: export VERCEL_TOKEN=your_token');
    console.error('');
    console.error('Alternatively, use the shell script: ./stop-other-vercel-deployments.sh');
    process.exit(1);
}

function makeRequest(path, method = 'GET', data = null) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'api.vercel.com',
            path: path,
            method: method,
            headers: {
                'Authorization': `Bearer ${VERCEL_TOKEN}`,
                'Content-Type': 'application/json'
            }
        };

        if (data) {
            const postData = JSON.stringify(data);
            options.headers['Content-Length'] = Buffer.byteLength(postData);
        }

        const req = https.request(options, (res) => {
            let body = '';
            res.on('data', (chunk) => { body += chunk; });
            res.on('end', () => {
                // Handle empty responses (common for DELETE requests with 204 status)
                if (res.statusCode === 204 || (res.statusCode >= 200 && res.statusCode < 300 && !body.trim())) {
                    resolve(null);
                    return;
                }
                
                try {
                    if (!body.trim()) {
                        // Empty body but not 204 - might be an error
                        if (res.statusCode >= 200 && res.statusCode < 300) {
                            resolve(null);
                        } else {
                            reject(new Error(`API Error: ${res.statusCode} - Empty response`));
                        }
                        return;
                    }
                    
                    const parsed = JSON.parse(body);
                    if (res.statusCode >= 200 && res.statusCode < 300) {
                        resolve(parsed);
                    } else {
                        reject(new Error(`API Error: ${res.statusCode} - ${JSON.stringify(parsed)}`));
                    }
                } catch (e) {
                    // If it's a successful status code with empty body, treat as success
                    if (res.statusCode >= 200 && res.statusCode < 300 && !body.trim()) {
                        resolve(null);
                    } else {
                        reject(new Error(`Parse Error: ${e.message} - Status: ${res.statusCode} - Body: ${body.substring(0, 100)}`));
                    }
                }
            });
        });

        req.on('error', reject);

        if (data) {
            req.write(JSON.stringify(data));
        }

        req.end();
    });
}

async function listProjects() {
    try {
        const path = `/v9/projects?teamId=${TEAM_ID}`;
        const response = await makeRequest(path);
        return response.projects || [];
    } catch (error) {
        console.error('Error listing projects:', error.message);
        // Try without team ID
        try {
            const response = await makeRequest('/v9/projects');
            return response.projects || [];
        } catch (e) {
            throw error;
        }
    }
}

async function getProjectDomains(projectId) {
    try {
        const path = `/v9/projects/${projectId}/domains?teamId=${TEAM_ID}`;
        const response = await makeRequest(path);
        return response.domains || [];
    } catch (error) {
        try {
            const response = await makeRequest(`/v9/projects/${projectId}/domains`);
            return response.domains || [];
        } catch (e) {
            return [];
        }
    }
}

async function removeProject(projectId) {
    try {
        const path = `/v9/projects/${projectId}?teamId=${TEAM_ID}`;
        await makeRequest(path, 'DELETE');
        return true;
    } catch (error) {
        // Try without team ID
        try {
            await makeRequest(`/v9/projects/${projectId}`, 'DELETE');
            return true;
        } catch (e) {
            throw error;
        }
    }
}

async function main() {
    console.log('🔍 Fetching Vercel projects...\n');

    let projects;
    try {
        projects = await listProjects();
    } catch (error) {
        console.error('❌ Failed to list projects:', error.message);
        console.error('\n💡 Make sure your VERCEL_TOKEN is valid');
        console.error('💡 Get token from: https://vercel.com/account/tokens');
        process.exit(1);
    }

    if (!projects || projects.length === 0) {
        console.log('✅ No projects found');
        return;
    }

    console.log('📋 Found projects:');
    projects.forEach(p => {
        console.log(`  - ${p.name} (${p.id})`);
    });
    console.log('');

    // Try to find by name first
    let correctProject = projects.find(p => p.name === CORRECT_PROJECT_NAME);
    
    // If not found, check domains for each project
    if (!correctProject) {
        console.log('🔍 Checking project domains to find the correct one...\n');
        const TARGET_DOMAIN = 'dynapharm-namibia-management-system-pi';
        
        for (const project of projects) {
            const domains = await getProjectDomains(project.id);
            const domainNames = domains.map(d => d.name || d).join(', ');
            
            // Check if any domain matches
            if (domains.some(d => {
                const domain = d.name || d;
                return domain.includes(TARGET_DOMAIN) || domain === `${TARGET_DOMAIN}.vercel.app`;
            })) {
                correctProject = project;
                console.log(`✅ Found correct project by domain: ${project.name}`);
                break;
            }
        }
    }

    if (!correctProject) {
        console.error(`❌ Could not find project with name or domain matching: ${CORRECT_PROJECT_NAME}`);
        console.error('\nAvailable projects:');
        projects.forEach(p => console.error(`  - ${p.name}`));
        console.error('\n💡 Please check the Vercel dashboard to find the correct project name');
        process.exit(1);
    }

    console.log(`✅ Found correct project: ${CORRECT_PROJECT_NAME} (${correctProject.id})\n`);

    const otherProjects = projects.filter(p => p.id !== correctProject.id);

    if (otherProjects.length === 0) {
        console.log('✅ No other projects to remove. Only the correct project exists.');
        return;
    }

    console.log('📦 Projects to remove:');
    otherProjects.forEach(p => {
        console.log(`  - ${p.name} (${p.id})`);
    });
    console.log('');

    // Check for --yes flag for non-interactive mode
    const autoConfirm = process.argv.includes('--yes') || process.env.AUTO_CONFIRM === 'true';
    
    if (!autoConfirm) {
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });

        const answer = await new Promise(resolve => {
            rl.question('⚠️  Are you sure you want to remove these projects? (yes/no): ', resolve);
        });

        rl.close();

        if (answer.toLowerCase() !== 'yes') {
            console.log('❌ Cancelled');
            return;
        }
    } else {
        console.log('⚠️  Auto-confirming removal (--yes flag set)\n');
    }

    console.log('\n🗑️  Removing projects...\n');

    for (const project of otherProjects) {
        try {
            await removeProject(project.id);
            console.log(`  ✅ Removed: ${project.name}`);
        } catch (error) {
            console.error(`  ⚠️  Failed to remove ${project.name}: ${error.message}`);
        }
    }

    console.log('\n✅ Done! Keeping only:', CORRECT_PROJECT_NAME);
    console.log(`🌐 Correct deployment: https://${CORRECT_PROJECT_NAME}.vercel.app`);
}

main().catch(error => {
    console.error('❌ Error:', error.message);
    process.exit(1);
});

