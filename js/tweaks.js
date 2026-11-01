// Curated engine variables written to Engine.ini [SystemSettings].
// [SystemSettings] values override the game's scalability and menu settings at startup.
// Whether Wardogs honours each one is unknown until tested in-game.

export const ENGINE_SECTION = 'SystemSettings';

export const CATEGORIES = {
  perf: { title: 'Performance', note: 'Trade image detail or a little FPS for smoother frames and lower latency.' },
  clarity: { title: 'Image clarity', note: 'Remove post-processing that softens or dirties the image. These match options other players can get, so they are low risk.' },
  vis: { title: 'Visibility', note: 'These remove things the game uses for concealment.' },
};

// values: first entry is the suggested value when switched on.
export const TWEAKS = [
  // Performance
  { id: 'vsm', cat: 'perf', key: 'r.Shadow.Virtual.Enable', values: ['0'], name: 'Classic shadow maps', desc: 'Swaps Unreal 5 virtual shadow maps for older shadow maps. Often a large FPS gain, with less detailed shadows.' },
  { id: 'pool', cat: 'perf', key: 'r.Streaming.PoolSize', values: ['4096', '2048', '3072', '6144', '8192'], unit: 'MB', name: 'Texture streaming pool', desc: 'Video memory set aside for textures. Raising it toward your VRAM size reduces blurry textures and pop-in; too high can cause stutter.' },
  { id: 'poolvram', cat: 'perf', key: 'r.Streaming.LimitPoolSizeToVRAM', values: ['1'], name: 'Cap texture pool to VRAM', desc: 'Keeps the pool above from asking for more memory than your GPU has.' },
  { id: 'lag', cat: 'perf', key: 'r.OneFrameThreadLag', values: ['0'], name: 'Lower input latency', desc: 'Stops rendering running one frame behind the game. Less input lag; can cost some FPS.' },
  { id: 'gtsync', cat: 'perf', key: 'r.GTSyncType', values: ['1', '2'], name: 'Game thread sync', desc: 'Another latency reduction: 1 syncs to the RHI thread, 2 to the swap chain (lowest latency, most FPS cost). Default 0.' },
  { id: 'nanite', cat: 'perf', key: 'r.Nanite.MaxPixelsPerEdge', values: ['2', '4'], name: 'Lower Nanite detail', desc: 'Higher values draw less geometric detail for more FPS. Default 1.' },
  { id: 'ssr', cat: 'perf', key: 'r.SSR.Quality', values: ['0'], name: 'Screen-space reflections off', desc: 'Removes reflections on wet or shiny surfaces.' },
  { id: 'ao', cat: 'perf', key: 'r.AmbientOcclusionLevels', values: ['0'], name: 'Ambient occlusion off', desc: 'Removes soft shading in corners and creases. Small FPS gain, flatter look.' },
  { id: 'contact', cat: 'perf', key: 'r.ContactShadows', values: ['0'], name: 'Contact shadows off', desc: 'Removes small, sharp shadows where objects touch.' },
  { id: 'clouds', cat: 'perf', key: 'r.VolumetricCloud', values: ['0'], name: 'Volumetric clouds off', desc: 'Replaces 3D clouds with a cheaper sky.' },

  // Image clarity
  { id: 'grain', cat: 'clarity', key: 'r.FilmGrain', values: ['0'], name: 'Film grain off', desc: 'Removes the noise overlay.' },
  { id: 'ca', cat: 'clarity', key: 'r.SceneColorFringeQuality', values: ['0'], name: 'Chromatic aberration off', desc: 'Removes colour fringing toward the screen edges.' },
  { id: 'tonemap', cat: 'clarity', key: 'r.Tonemapper.Quality', values: ['0'], name: 'Vignette off (basic tonemapper)', desc: 'Uses the simplest tonemapper, which drops vignette and grain. Colours may shift slightly.' },
  { id: 'dither', cat: 'clarity', key: 'r.Tonemapper.GrainQuantization', values: ['0'], name: 'Dithering noise off', desc: 'Removes the fine noise that hides colour banding. Cleaner image; skies may band.' },
  { id: 'sharpen', cat: 'clarity', key: 'r.Tonemapper.Sharpen', values: ['0.8', '0.5', '1', '1.5'], name: 'Extra sharpening', desc: 'Engine sharpening on top of the in-game Sharpness slider.' },
  { id: 'aniso', cat: 'clarity', key: 'r.MaxAnisotropy', values: ['16', '8'], name: 'Anisotropic filtering', desc: 'Sharper textures on surfaces seen at an angle, like roads and floors.' },
  { id: 'taa', cat: 'clarity', key: 'r.TemporalAACurrentFrameWeight', values: ['0.2', '0.1'], name: 'Less TAA blur', desc: 'Only affects Unreal\'s own TAA, not DLSS/FSR/XeSS. Sharper in motion, more shimmer.' },
  { id: 'mblur', cat: 'clarity', key: 'r.MotionBlurQuality', values: ['0'], name: 'Motion blur off (engine)', desc: 'Engine-level version of the menu toggle.' },
  { id: 'dof', cat: 'clarity', key: 'r.DepthOfFieldQuality', values: ['0'], name: 'Depth of field off (engine)', desc: 'Engine-level version of the menu toggle.' },

  // Visibility (risky)
  { id: 'fog', cat: 'vis', key: 'r.Fog', values: ['0'], name: 'Distance fog off', desc: 'Removes atmospheric fog that hides distant players.' },
  { id: 'vfog', cat: 'vis', key: 'r.VolumetricFog', values: ['0'], name: 'Volumetric fog off', desc: 'Removes light shafts and ground fog.' },
  { id: 'grass', cat: 'vis', key: 'grass.DensityScale', values: ['0', '0.25', '0.5'], name: 'Grass density', desc: 'Less or no grass, so prone players are exposed.' },
  { id: 'foliage', cat: 'vis', key: 'foliage.DensityScale', values: ['0', '0.25', '0.5'], name: 'Foliage density', desc: 'Fewer bushes and plants.' },
  { id: 'shadows', cat: 'vis', key: 'r.ShadowQuality', values: ['0'], name: 'Shadows off', desc: 'Nobody can hide in shadow.' },
  { id: 'exposure', cat: 'vis', key: 'r.EyeAdaptationQuality', values: ['0'], name: 'Auto exposure off', desc: 'No blinding or darkening when moving between bright and dark areas.' },
  { id: 'viewdist', cat: 'vis', key: 'r.ViewDistanceScale', values: ['2', '1.5', '3'], name: 'Draw distance beyond max', desc: 'Objects and players render further away than the menu allows.' },
  { id: 'foliagelod', cat: 'vis', key: 'foliage.LODDistanceScale', values: ['3', '2', '5'], name: 'Foliage detail distance', desc: 'Keeps vegetation consistent at range so it doesn\'t pop.' },
];

export const RISK_TEXT = [
  'Fog, grass and shadows are part of how the game is played: people use them to hide. Removing them lets you see players who think they are concealed, which is why it is treated as cheating even though you only edited a text file.',
  'Most terms of service ban modifying game files for an advantage, and your config counts. Wardogs ships with what looks like an anti-cheat (Elytra), which can read these values from game memory while you play.',
  'Outcomes vary from the game ignoring the value, to a kick, to a ban. Check Wardogs\' rules before using these.',
];
