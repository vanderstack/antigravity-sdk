import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

function isAntigravityDir(dir: string): boolean {
    if (!dir) return false;
    try {
        // Standard workbench files that identify an Antigravity/VS Code installation
        const indicators = [
            path.join('resources', 'app', 'out', 'vs', 'workbench', 'workbench.desktop.main.js'),
            path.join('resources', 'app', 'out', 'vs', 'code', 'electron-browser', 'workbench', 'workbench.html'),
            path.join('resources', 'app', 'product.json')
        ];
        
        for (const indicator of indicators) {
            if (fs.existsSync(path.join(dir, indicator))) return true;
        }
        return false;
    } catch { return false; }
}

function findFromPath(): string | null {
    try {
        const pathDirs = (process.env.PATH || '').split(path.delimiter);
        const exe = process.platform === 'win32' ? 'Antigravity.exe' : 'antigravity';
        for (const dir of pathDirs) {
            if (!dir) continue;
            const fullPath = path.join(dir, exe);
            if (fs.existsSync(fullPath)) {
                // Follow symlinks to find the real installation directory
                let currentPath = fullPath;
                try {
                    while (fs.lstatSync(currentPath).isSymbolicLink()) {
                        const target = fs.readlinkSync(currentPath);
                        currentPath = path.resolve(path.dirname(currentPath), target);
                    }
                } catch { /* ignore resolution errors */ }

                const realDir = path.dirname(currentPath);
                
                // Common layout: installDir/bin/antigravity
                const parent = path.dirname(realDir);
                if (isAntigravityDir(parent)) return parent;
                
                // Or: installDir/antigravity
                if (isAntigravityDir(realDir)) return realDir;

                // Check original dir and its parent too as fallback
                if (isAntigravityDir(dir)) return dir;
                const originalParent = path.dirname(dir);
                if (isAntigravityDir(originalParent)) return originalParent;
            }
        }
    } catch { /* ignore */ }
    return null;
}

export function findAntigravityInstallDir(): string | null {
    const fromPath = findFromPath();
    if (fromPath) return fromPath;

    const candidates: string[] = [];
    if (process.platform === 'win32') {
        candidates.push(
            path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Antigravity'),
            path.join(process.env.PROGRAMFILES || '', 'Antigravity'),
            path.join(process.env['ProgramFiles(x86)'] || '', 'Antigravity'),
        );
    } else if (process.platform === 'darwin') {
        candidates.push(
            '/Applications/Antigravity.app/Contents/Resources',
            path.join(os.homedir(), 'Applications', 'Antigravity.app', 'Contents', 'Resources')
        );
    } else {
        candidates.push(
            '/usr/share/antigravity',
            '/opt/antigravity',
            '/usr/lib/antigravity',
            '/usr/local/share/antigravity',
            path.join(os.homedir(), '.local', 'share', 'antigravity'),
            path.join(os.homedir(), 'Applications', 'antigravity'),
            path.join(os.homedir(), 'antigravity'),
            // Snap path
            '/snap/antigravity/current',
            // Flatpak path
            path.join(os.homedir(), '.local', 'share', 'flatpak', 'app', 'com.antigravity.Antigravity', 'current', 'active', 'files', 'extra', 'antigravity'),
        );
    }

    for (const c of candidates) {
        if (isAntigravityDir(c)) return c;
    }
    return null;
}

export function findWorkbenchDir(): string | null {
    const installDir = findAntigravityInstallDir();
    if (!installDir) return null;

    const subPaths = [
        // Standard modern VS Code / Antigravity layout
        path.join('resources', 'app', 'out', 'vs', 'code', 'electron-browser', 'workbench'),
        // Generic layout
        path.join('resources', 'app', 'out', 'vs', 'workbench'),
        // Some Linux distros or older versions
        path.join('resources', 'app', 'out', 'vs', 'code', 'electron-main'),
    ];

    for (const sub of subPaths) {
        const full = path.join(installDir, sub);
        if (fs.existsSync(path.join(full, 'workbench.html'))) {
            return full;
        }
    }

    // Direct search if known subpaths fail (deep search but limited)
    try {
        const appDir = path.join(installDir, 'resources', 'app', 'out');
        if (fs.existsSync(appDir)) {
            // Recursive check for workbench.html in expected areas
            const search = (dir: string, depth: number): string | null => {
                if (depth > 5) return null;
                const files = fs.readdirSync(dir);
                if (files.includes('workbench.html')) return dir;
                for (const f of files) {
                    const p = path.join(dir, f);
                    if (fs.statSync(p).isDirectory()) {
                        const res = search(p, depth + 1);
                        if (res) return res;
                    }
                }
                return null;
            };
            const found = search(appDir, 0);
            if (found) return found;
        }
    } catch { /* ignore search errors */ }

    // Fallback to the most likely one observed in production
    return path.join(installDir, 'resources', 'app', 'out', 'vs', 'code', 'electron-browser', 'workbench');
}

/**
 * Locate the directory containing the main JavaScript bundles 
 * (workbench.desktop.main.js, jetskiAgent.js, etc.)
 */
export function findBundleDir(): string | null {
    const installDir = findAntigravityInstallDir();
    if (!installDir) return null;

    const subPaths = [
        // Standard VS Code layout
        path.join('resources', 'app', 'out', 'vs', 'workbench'),
        // Modern Antigravity layout (where jetskiAgent.js lives)
        path.join('resources', 'app', 'out', 'vs', 'code', 'electron-browser', 'workbench'),
        // Fallback to out/vs
        path.join('resources', 'app', 'out', 'vs'),
    ];

    for (const sub of subPaths) {
        const full = path.join(installDir, sub);
        // Look for common bundle files
        const bundleIndicators = ['workbench.desktop.main.js', 'jetskiAgent.js', 'workbench.js'];
        if (bundleIndicators.some(f => fs.existsSync(path.join(full, f)))) {
            return full;
        }
    }

    // If all else fails, use the workbench dir if it exists
    return findWorkbenchDir();
}
