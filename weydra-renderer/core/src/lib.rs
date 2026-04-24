//! weydra-renderer — 2D GPU renderer using wgpu.

pub mod camera;
pub mod device;
pub mod error;
pub mod frame;
pub mod surface;

pub use camera::CameraUniforms;
pub use device::GpuContext;
pub use error::{Result, WeydraError};
pub use frame::render_clear;
pub use surface::RenderSurface;
