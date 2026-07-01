import { HttpErrorResponse } from '@angular/common/http';
import { extractErrorMessage } from './http-error.util';

describe('extractErrorMessage', () => {
  it('returns the backend message when it is a plain string', () => {
    const error = new HttpErrorResponse({ error: { message: 'Invalid or expired OTP' } });
    expect(extractErrorMessage(error)).toBe('Invalid or expired OTP');
  });

  it('joins an array of validation messages into one string', () => {
    const error = new HttpErrorResponse({
      error: { message: ['name should not be empty', 'price must be positive'] },
    });
    expect(extractErrorMessage(error)).toBe(
      'name should not be empty, price must be positive',
    );
  });

  it('falls back to the default message for a non-HttpErrorResponse', () => {
    expect(extractErrorMessage(new Error('network down'))).toBe(
      'Something went wrong. Please try again.',
    );
  });

  it('uses a custom fallback when provided', () => {
    expect(extractErrorMessage(new Error('x'), 'Custom fallback')).toBe(
      'Custom fallback',
    );
  });

  it('falls back when the backend error body has no message field', () => {
    const error = new HttpErrorResponse({ error: {} });
    expect(extractErrorMessage(error)).toBe(
      'Something went wrong. Please try again.',
    );
  });
});
