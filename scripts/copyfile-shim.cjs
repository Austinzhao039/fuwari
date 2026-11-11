/*
 * overlayfs 上 copy_file_range 会返回 EPERM（跨 overlay 层拷贝的已知限制），
 * 而 vite / astro 打包静态资源时用的是 fs.copyFileSync / fs.promises.copyFile。
 * 这里把失败的情况降级成「读进内存再写出去」，其余行为不变。
 *
 * 用法：NODE_OPTIONS="--require /path/to/copyfile-shim.cjs" node ...
 */
const fs = require("fs");

const isOverlayErr = (err) =>
	err && (err.code === "EPERM" || err.code === "EXDEV" || err.code === "ENOSYS");

let patched = 0;

/* ---- 同步版 ---- */
const origCopyFileSync = fs.copyFileSync;
fs.copyFileSync = function copyFileSync(src, dest, mode) {
	try {
		return origCopyFileSync.call(fs, src, dest, mode);
	} catch (err) {
		if (!isOverlayErr(err)) throw err;
		patched++;
		fs.writeFileSync(dest, fs.readFileSync(src));
		return undefined;
	}
};

/* ---- 回调版 ---- */
const origCopyFile = fs.copyFile;
fs.copyFile = function copyFile(src, dest, flags, cb) {
	if (typeof flags === "function") {
		cb = flags;
		flags = 0;
	}
	return origCopyFile.call(fs, src, dest, flags, (err) => {
		if (!err || !isOverlayErr(err)) return cb(err || null);
		patched++;
		fs.readFile(src, (rErr, data) => {
			if (rErr) return cb(rErr);
			fs.writeFile(dest, data, (wErr) => cb(wErr || null));
		});
	});
};

/* ---- Promise 版 ---- */
const fsp = fs.promises;
const origPromiseCopyFile = fsp.copyFile;
fsp.copyFile = async function copyFile(src, dest, mode) {
	try {
		return await origPromiseCopyFile.call(fsp, src, dest, mode);
	} catch (err) {
		if (!isOverlayErr(err)) throw err;
		patched++;
		const data = await fsp.readFile(src);
		await fsp.writeFile(dest, data);
		return undefined;
	}
};

process.on("exit", () => {
	if (patched > 0) {
		process.stderr.write(`[copyfile-shim] copy_file_range 不可用，已降级拷贝 ${patched} 个文件\n`);
	}
});
