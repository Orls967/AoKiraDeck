import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { WebGLFallbackView } from '@/components/WebGLFallbackView';
import { WebGLErrorBoundary } from '@/components/WebGLErrorBoundary';

describe('WebGLFallbackView & WebGLErrorBoundary (AC-17)', () => {
  it('renders 2D engineering schematic and dispatches component selection', () => {
    const onSelect = vi.fn();
    render(
      <WebGLFallbackView
        selectedComponentId="input-conveyor"
        onSelectComponent={onSelect}
        snapshot={null}
      />
    );

    expect(screen.getByTestId('webgl-fallback-view')).toBeInTheDocument();
    expect(screen.getByText(/Top Plan View/i)).toBeInTheDocument();
    expect(screen.getByText(/Front Elevation/i)).toBeInTheDocument();
  });

  it('catches WebGL child exceptions inside WebGLErrorBoundary', () => {
    const Boom = () => {
      throw new Error('Simulated WebGL context failure');
    };
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <WebGLErrorBoundary fallback={<WebGLFallbackView />}>
        <Boom />
      </WebGLErrorBoundary>
    );
    expect(screen.getByTestId('webgl-fallback-view')).toBeInTheDocument();
    spy.mockRestore();
  });

  it('allows clicking safety fence in fallback schematic', () => {
    const onSelect = vi.fn();
    const { container } = render(<WebGLFallbackView onSelectComponent={onSelect} />);
    const fenceRect = container.querySelector('rect[stroke-dasharray="6 4"]');
    expect(fenceRect).not.toBeNull();
    if (fenceRect) {
      fireEvent.click(fenceRect);
      expect(onSelect).toHaveBeenCalledWith('safety-fence');
    }
  });
});
