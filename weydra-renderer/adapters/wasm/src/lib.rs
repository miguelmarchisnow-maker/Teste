//! WASM adapter for weydra-renderer.
//!
//! Exposes a wasm-bindgen Renderer that wraps the core pipeline and binds
//! to an HtmlCanvasElement. All hot-path per-frame ops (position updates,
//! etc.) will use shared memory escape hatches added in later milestones.

use wasm_bindgen::prelude::*;
use web_sys::HtmlCanvasElement;
use weydra_renderer::{render_clear, GpuContext, RenderSurface};

/// Entry-point: wire up panic hook. Called once from TS before any Renderer is created.
#[wasm_bindgen(start)]
pub fn init_panic_hook() {
    console_error_panic_hook::set_once();
}

/// The weydra renderer instance, bound to a specific canvas.
#[wasm_bindgen]
pub struct Renderer {
    ctx: GpuContext,
    surface: RenderSurface<'static>,
}

#[wasm_bindgen]
impl Renderer {
    #[wasm_bindgen(constructor)]
    pub async fn new(canvas: HtmlCanvasElement) -> Result<Renderer, JsValue> {
        let width = canvas.width();
        let height = canvas.height();

        // wgpu 29: Instance::new takes InstanceDescriptor by value, and InstanceDescriptor
        // has no Default — use new_without_display_handle().
        let instance = wgpu::Instance::new(wgpu::InstanceDescriptor::new_without_display_handle());

        // SurfaceTarget::Canvas takes ownership of the HtmlCanvasElement.
        let surface_target = wgpu::SurfaceTarget::Canvas(canvas);
        let surface = instance
            .create_surface(surface_target)
            .map_err(|e| JsValue::from_str(&format!("surface: {e}")))?;

        // wgpu 29: request_adapter returns Result<Adapter, E>
        let adapter = instance
            .request_adapter(&wgpu::RequestAdapterOptions {
                power_preference: wgpu::PowerPreference::HighPerformance,
                compatible_surface: Some(&surface),
                force_fallback_adapter: false,
            })
            .await
            .map_err(|e| JsValue::from_str(&format!("adapter: {e}")))?;

        // wgpu 29: request_device takes DeviceDescriptor only, descriptor requires experimental_features.
        let (device, queue) = adapter
            .request_device(&wgpu::DeviceDescriptor {
                label: Some("weydra device (wasm)"),
                required_features: wgpu::Features::empty(),
                required_limits: wgpu::Limits::downlevel_webgl2_defaults(),
                memory_hints: wgpu::MemoryHints::Performance,
                experimental_features: wgpu::ExperimentalFeatures::disabled(),
                trace: wgpu::Trace::Off,
            })
            .await
            .map_err(|e| JsValue::from_str(&format!("device: {e}")))?;

        let ctx = GpuContext { instance, adapter, device, queue };
        let render_surface = RenderSurface::configure(&ctx, surface, width, height)
            .map_err(|e| JsValue::from_str(&format!("config: {e}")))?;

        Ok(Renderer { ctx, surface: render_surface })
    }

    pub fn resize(&mut self, width: u32, height: u32) {
        self.surface.resize(&self.ctx, width, height);
    }

    pub fn render(&mut self) -> Result<(), JsValue> {
        render_clear(&self.ctx, &self.surface, [0.0, 0.0, 0.0, 1.0])
            .map_err(|e| JsValue::from_str(&format!("render: {e}")))
    }
}
