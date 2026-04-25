//! Specialized GPU instance pools.
//!
//! Each shader with custom uniforms that needs N>1 live instances drawn in
//! a single render pass gets its own pool here. Unlike the generic
//! `UniformPool<T>` (which holds one shared bind group at offset 0), these
//! pools allocate one shared GPU buffer with a SINGLE bind group + dynamic
//! offset per draw call, so the engine sets the bind group once and indexes
//! per-instance via `set_bind_group(.., &[offset])`.

pub mod planet;

pub use planet::{PlanetPool, PlanetUniforms, PLANET_UNIFORMS_SIZE};
