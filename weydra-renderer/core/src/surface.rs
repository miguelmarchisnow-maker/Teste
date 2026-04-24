use crate::device::GpuContext;
use crate::error::{Result, WeydraError};

/// A configured render surface — the thing we actually draw into every frame.
///
/// Wraps wgpu::Surface + config. On the browser side, this is created from an
/// HtmlCanvasElement via the wasm adapter; natively, from a winit Window.
pub struct RenderSurface<'window> {
    pub surface: wgpu::Surface<'window>,
    pub config: wgpu::SurfaceConfiguration,
    pub format: wgpu::TextureFormat,
}

impl<'window> RenderSurface<'window> {
    /// Configure a surface that was previously created by the platform adapter.
    pub fn configure(
        ctx: &GpuContext,
        surface: wgpu::Surface<'window>,
        width: u32,
        height: u32,
    ) -> Result<Self> {
        let caps = surface.get_capabilities(&ctx.adapter);
        let format = caps
            .formats
            .iter()
            .find(|f| f.is_srgb())
            .copied()
            .unwrap_or_else(|| caps.formats[0]);

        let config = wgpu::SurfaceConfiguration {
            usage: wgpu::TextureUsages::RENDER_ATTACHMENT,
            format,
            width: width.max(1),
            height: height.max(1),
            present_mode: wgpu::PresentMode::AutoVsync,
            alpha_mode: caps.alpha_modes[0],
            view_formats: vec![],
            desired_maximum_frame_latency: 2,
        };

        surface.configure(&ctx.device, &config);

        Ok(Self { surface, config, format })
    }

    /// Resize the swap chain. Must be called when the window/canvas size changes.
    pub fn resize(&mut self, ctx: &GpuContext, width: u32, height: u32) {
        self.config.width = width.max(1);
        self.config.height = height.max(1);
        self.surface.configure(&ctx.device, &self.config);
    }

    /// Acquire the next texture to render into. Returned texture must be
    /// presented (via SurfaceTexture::present) before the next frame.
    pub fn acquire_next_texture(&self) -> Result<wgpu::SurfaceTexture> {
        match self.surface.get_current_texture() {
            wgpu::CurrentSurfaceTexture::Success(t)
            | wgpu::CurrentSurfaceTexture::Suboptimal(t) => Ok(t),
            wgpu::CurrentSurfaceTexture::Timeout => Err(WeydraError::SurfaceCreationFailed(
                "surface acquire timeout".into(),
            )),
            wgpu::CurrentSurfaceTexture::Occluded => Err(WeydraError::SurfaceCreationFailed(
                "surface occluded".into(),
            )),
            wgpu::CurrentSurfaceTexture::Outdated => Err(WeydraError::SurfaceCreationFailed(
                "surface outdated".into(),
            )),
            wgpu::CurrentSurfaceTexture::Lost => {
                Err(WeydraError::SurfaceCreationFailed("surface lost".into()))
            }
            wgpu::CurrentSurfaceTexture::Validation => Err(WeydraError::SurfaceCreationFailed(
                "surface validation error".into(),
            )),
        }
    }
}
