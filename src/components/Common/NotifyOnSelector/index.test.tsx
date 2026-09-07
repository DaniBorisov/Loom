import NotifyOnSelector from '@app/components/Common/NotifyOnSelector';
import type { NotifyOnValue } from '@app/components/Common/NotifyOnSelector';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';

const renderSelector = (
  value: NotifyOnValue,
  onChange: (value: NotifyOnValue) => void = () => {}
) =>
  render(
    <IntlProvider locale="en" defaultLocale="en">
      <NotifyOnSelector value={value} onChange={onChange} />
    </IntlProvider>
  );

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('NotifyOnSelector (DAN-48)', () => {
  it('reflects the current server value', () => {
    renderSelector('none');
    expect(
      (screen.getByTestId('notify-on-selector') as HTMLSelectElement).value
    ).toBe('none');
  });

  it('offers all four preferences and reports changes', () => {
    const onChange = vi.fn();
    renderSelector('both', onChange);

    const select = screen.getByTestId(
      'notify-on-selector'
    ) as HTMLSelectElement;
    expect(select.options.length).toBe(4);

    fireEvent.change(select, { target: { value: 'episode_airing' } });
    expect(onChange).toHaveBeenCalledWith('episode_airing');
  });
});
