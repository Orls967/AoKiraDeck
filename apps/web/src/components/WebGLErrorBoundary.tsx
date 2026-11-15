import { Component, type ErrorInfo, type ReactNode } from 'react';

interface WebGLErrorBoundaryProps {
  children: ReactNode;
  fallback: ReactNode;
  onError?: (error: Error) => void;
}

interface WebGLErrorBoundaryState {
  hasError: boolean;
  errorMessage: string | null;
}

export function detectWebGLSupport(): boolean {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return false;
  }
  try {
    const canvas = document.createElement('canvas');
    const gl2 = canvas.getContext('webgl2');
    if (gl2) return true;
    const gl1 = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    return Boolean(gl1);
  } catch {
    return false;
  }
}

let softwareRendererCache: boolean | null = null;

/**
 * True when WebGL is backed by a CPU rasteriser (SwiftShader, llvmpipe, Microsoft Basic Render
 * Driver), e.g. VMs, CI runners or machines with GPU acceleration disabled. The 3D scene drops
 * its environment map and shadows there to stay interactive.
 */
export function detectSoftwareRenderer(): boolean {
  if (softwareRendererCache !== null) return softwareRendererCache;
  let result = false;
  try {
    const canvas = document.createElement('canvas');
    const gl = (canvas.getContext('webgl2') || canvas.getContext('webgl')) as
      | WebGLRenderingContext
      | WebGL2RenderingContext
      | null;
    if (gl) {
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      const renderer = String(
        ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
      );
      result = /swiftshader|llvmpipe|softpipe|software|basic render/i.test(renderer);
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    }
  } catch {
    result = false;
  }
  softwareRendererCache = result;
  return result;
}

export class WebGLErrorBoundary extends Component<
  WebGLErrorBoundaryProps,
  WebGLErrorBoundaryState
> {
  state: WebGLErrorBoundaryState = {
    hasError: false,
    errorMessage: null,
  };

  static getDerivedStateFromError(error: Error): WebGLErrorBoundaryState {
    return {
      hasError: true,
      errorMessage: error.message,
    };
  }

  componentDidCatch(error: Error, _info: ErrorInfo): void {
    this.props.onError?.(error);
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return this.props.fallback;
    }
    return this.props.children;
  }
}
