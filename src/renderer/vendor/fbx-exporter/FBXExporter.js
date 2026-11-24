/**
 * Public exporter facade — public API + plugin hook surface in the style of
 * three.js's GLTFExporter (examples/jsm/exporters/GLTFExporter.js: class
 * GLTFExporter at line 104).
 *
 * Usage:
 *   const exporter = new FBXExporter();
 *   const bytes = await exporter.parseAsync(scene, options);
 *   fs.writeFileSync('out.fbx', bytes);
 *
 * Sync vs async — parseSync works for scenes with no textures OR with
 * DataTextures only (our PNG encoder is synchronous). HTMLImageElement /
 * ImageBitmap / canvas-backed Textures require the async `canvas.toBlob`
 * pipeline; use parseAsync (or pass `options.embedTextures: false` to
 * skip).
 */
import { collectScene } from './data/SceneCollector.js';
import { writeFBX } from './FBXWriter.js';
import { encodeTextures } from './data/textureCollector.js';
import { encodeRGBA8PNG } from './data/textureEncoder.js';
const DEFAULT_OPTIONS = {
    version: 7400,
    fps: 24.0,
    embedTextures: true,
};
export class FBXExporter {
    pluginCallbacks = [];
    /** GLTFExporter-style plugin registration. */
    register(callback) {
        if (!this.pluginCallbacks.includes(callback))
            this.pluginCallbacks.push(callback);
        return this;
    }
    unregister(callback) {
        const i = this.pluginCallbacks.indexOf(callback);
        if (i !== -1)
            this.pluginCallbacks.splice(i, 1);
        return this;
    }
    /**
     * Synchronous parse. Texture embedding only works for DataTextures
     * (encoded via the inline PNG encoder). HTMLImage / canvas textures must
     * go through parseAsync.
     */
    parseSync(input, options = {}) {
        const settings = { ...DEFAULT_OPTIONS, ...options };
        const sceneData = collectScene(input, settings);
        if (settings.embedTextures !== false)
            encodeTexturesSyncOnly(sceneData);
        for (const cb of this.pluginCallbacks)
            cb(sceneData);
        return writeFBX(sceneData);
    }
    parse(input, onDone, onError, options) {
        this.parseAsync(input, options).then(onDone, onError ?? ((e) => { throw e; }));
    }
    /** Asynchronous parse — waits for canvas-based texture encodings. */
    async parseAsync(input, options = {}) {
        const settings = { ...DEFAULT_OPTIONS, ...options };
        const sceneData = collectScene(input, settings);
        if (settings.embedTextures !== false && sceneData.textures) {
            await encodeTextures(sceneData.textures);
        }
        for (const cb of this.pluginCallbacks)
            cb(sceneData);
        return writeFBX(sceneData);
    }
}
/**
 * Synchronous variant of encodeTextures — only handles DataTextures. Any
 * texture that would need canvas (HTMLImage / ImageBitmap / etc.) is left
 * unencoded with a console warning.
 */
function encodeTexturesSyncOnly(sceneData) {
    if (!sceneData.textures || !sceneData.textures.textures)
        return;
    for (const [, entry] of sceneData.textures.textures) {
        const tex = entry.texture;
        if (tex.isDataTexture || (tex.image && tex.image.data instanceof Uint8Array)) {
            try {
                const { data, width, height } = tex.image;
                entry.imageBytes = encodeRGBA8PNG(data, width, height);
                entry.extension = 'png';
            }
            catch (err) {
                console.warn(`fbx-exporter-three: failed to encode DataTexture "${tex.name || '<unnamed>'}": ${err.message}`);
            }
        }
        else {
            console.warn(`fbx-exporter-three: skipping embed of texture "${tex.name || '<unnamed>'}" — ` +
                `parseSync only handles DataTextures. Use parseAsync to embed HTMLImage / ` +
                `canvas-backed textures.`);
        }
    }
}
