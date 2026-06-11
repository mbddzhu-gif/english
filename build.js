const fs = require('fs/promises');
const path = require('path');
const esbuild = require('esbuild');

async function ensureDir(p) {
    await fs.mkdir(p, { recursive: true });
}

async function copyFile(src, dest) {
    await ensureDir(path.dirname(dest));
    await fs.copyFile(src, dest);
}

async function minifyJs(src, dest) {
    const code = await fs.readFile(src, 'utf8');
    const result = await esbuild.transform(code, {
        loader: 'js',
        minify: true,
        target: 'es2019'
    });
    await ensureDir(path.dirname(dest));
    await fs.writeFile(dest, result.code, 'utf8');
}

async function minifyCss(src, dest) {
    const code = await fs.readFile(src, 'utf8');
    const result = await esbuild.transform(code, {
        loader: 'css',
        minify: true
    });
    await ensureDir(path.dirname(dest));
    await fs.writeFile(dest, result.code, 'utf8');
}

async function listFiles(dir, ext) {
    const out = [];
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            out.push(...await listFiles(full, ext));
        } else if (full.toLowerCase().endsWith(ext)) {
            out.push(full);
        }
    }
    return out;
}

async function main() {
    const root = __dirname;
    const dist = path.join(root, 'dist');

    await fs.rm(dist, { recursive: true, force: true });
    await ensureDir(dist);

    await copyFile(path.join(root, 'index.html'), path.join(dist, 'index.html'));

    const cssDir = path.join(root, 'css');
    const jsDir = path.join(root, 'js');
    const constantsDir = path.join(root, 'constants');
    const assetsDir = path.join(root, 'assets');

    const cssFiles = await listFiles(cssDir, '.css');
    for (const file of cssFiles) {
        const rel = path.relative(root, file);
        await minifyCss(file, path.join(dist, rel));
    }

    const jsFiles = await listFiles(jsDir, '.js');
    for (const file of jsFiles) {
        const rel = path.relative(root, file);
        await minifyJs(file, path.join(dist, rel));
    }

    try {
        const constantFiles = await listFiles(constantsDir, '.js');
        for (const file of constantFiles) {
            const rel = path.relative(root, file);
            await minifyJs(file, path.join(dist, rel));
        }
    } catch (e) {}

    try {
        const svgFiles = await listFiles(assetsDir, '.svg');
        for (const file of svgFiles) {
            const rel = path.relative(root, file);
            await copyFile(file, path.join(dist, rel));
        }
    } catch (e) {}

    try {
        const pngFiles = await listFiles(assetsDir, '.png');
        for (const file of pngFiles) {
            const rel = path.relative(root, file);
            await copyFile(file, path.join(dist, rel));
        }
    } catch (e) {}
}

main().catch((e) => {
    process.stderr.write((e && e.stack) ? e.stack : String(e));
    process.exit(1);
});

