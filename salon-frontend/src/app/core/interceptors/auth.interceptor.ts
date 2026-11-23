import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { from, switchMap, catchError, throwError } from 'rxjs';
import { AuthService } from '../services/auth.service';
import { environment } from '../../../environments/environment';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const authService = inject(AuthService);

  if (!req.url.startsWith(environment.apiUrl)) {
    return next(req);
  }

  const isAuthEndpoint = req.url.includes(`${environment.apiUrl}/auth/`);
  const token = authService.getAccessToken();
  const authedReq = token
    ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } })
    : req;

  return next(authedReq).pipe(
    catchError((error: unknown) => {
      const isExpiredToken =
        error instanceof HttpErrorResponse &&
        error.status === 401 &&
        !!token &&
        !isAuthEndpoint;

      if (!isExpiredToken) {
        return throwError(() => error);
      }

      // Access token likely expired mid-session - refresh once and retry
      // the original request rather than surfacing a confusing 401.
      return from(authService.refreshAccessToken()).pipe(
        switchMap((newToken) => {
          if (!newToken) {
            return throwError(() => error);
          }
          return next(
            req.clone({ setHeaders: { Authorization: `Bearer ${newToken}` } }),
          );
        }),
      );
    }),
  );
};
