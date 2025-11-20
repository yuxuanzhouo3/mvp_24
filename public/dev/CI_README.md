# CI/CD, Testing, and Monitoring Guide

This document explains how to use the CI/CD pipeline, run tests, configure Sentry monitoring, and set up uptime monitoring for the MultiGPT Platform.

## CI/CD Pipeline

### GitHub Actions Workflow

The project uses GitHub Actions for continuous integration. The workflow is defined in `.github/workflows/ci.yml` and runs on every push and pull request to `main` or `master` branches.

#### Quality Gates

The CI pipeline enforces the following quality gates:

1. **Install Dependencies**: Uses pnpm to install all dependencies
2. **Linting**: Runs ESLint to check code style
3. **Type Checking**: Runs TypeScript compiler (`tsc --noEmit`) to ensure type safety
4. **Testing**: Runs Jest test suite
5. **Build**: Builds the Next.js application

If any step fails, the pipeline stops and the PR cannot be merged.

#### Running CI Locally

You can run the same checks locally:

```bash
# Install dependencies
pnpm install

# Run linting
pnpm lint

# Run type checking
pnpm exec tsc --noEmit

# Run tests
pnpm test

# Build the application
pnpm build
```

### Test Scripts

- `pnpm test`: Run all tests with Jest
- `pnpm test:ci`: Run tests in CI mode (for GitHub Actions)

## Testing

### Test Structure

```
tests/
├── health.test.ts              # Unit test for health check
├── integration/
│   ├── health.integration.test.ts
│   └── auth.integration.test.ts
```

### Running Tests

```bash
# Run all tests
pnpm test

# Run tests in watch mode
pnpm test --watch

# Run specific test file
pnpm test health.test.ts

# Run with coverage
pnpm test --coverage
```

### Adding New Tests

- **Unit Tests**: Test individual functions/classes in `tests/*.test.ts`
- **Integration Tests**: Test API endpoints and external integrations in `tests/integration/*.test.ts`

## Sentry Error Monitoring

### Configuration

Sentry is integrated for error tracking and performance monitoring.

#### Environment Variables

Set the following environment variables:

```bash
# Required: Sentry DSN for error reporting
SENTRY_DSN=https://your-dsn@sentry.io/project-id

# Optional: Sample rate for performance monitoring (0.0 to 1.0)
SENTRY_TRACES_SAMPLE_RATE=0.1
```

#### Local Development

For local development, you can omit `SENTRY_DSN` and Sentry will be disabled automatically.

#### Production Deployment

1. Create a Sentry project at https://sentry.io
2. Get your DSN from the project settings
3. Set `SENTRY_DSN` in your production environment (Vercel, Railway, etc.)
4. Optionally set `SENTRY_TRACES_SAMPLE_RATE` for performance monitoring

### Error Capture

Sentry automatically captures:

- Unhandled exceptions in API routes
- Performance traces for API calls
- User context and request information

### Wrapped Routes

The following API routes have Sentry error capture enabled:

- `/api/health` - Health check endpoint
- `/api/chat/send` - Chat API
- `/api/chat/multi-send` - Multi-agent chat API
- `/api/payment/create` - Payment creation
- `/api/auth/status` - Authentication status

## Uptime Monitoring

### Setting Up External Monitoring

For production uptime monitoring, use one of these services:

#### Option 1: UptimeRobot (Recommended)

1. Go to https://uptimerobot.com and create an account
2. Add a new monitor:
   - Monitor Type: `HTTP(s)`
   - URL: `https://your-app-domain.com/api/health`
   - Monitoring Interval: `5 minutes`
3. Configure alerts (Email, SMS, Slack, etc.)

#### Option 2: Pingdom

1. Go to https://pingdom.com and create an account
2. Create a new uptime check:
   - Check type: `HTTP`
   - URL: `https://your-app-domain.com/api/health`
   - Check interval: `5 minutes`

#### Option 3: Healthchecks.io

1. Go to https://healthchecks.io and create an account
2. Create a new check with URL `https://your-app-domain.com/api/health`
3. Set up notifications via webhooks, email, or integrations

### Health Check Endpoint

The `/api/health` endpoint returns:

```json
{
  "status": "ok",
  "uptime": 123.45,
  "time": "2025-11-01T12:00:00.000Z",
  "version": "0.1.0"
}
```

- **Status Codes**:

  - `200`: Service is healthy
  - `500`: Service has issues

- **Monitoring**: External services should expect `200` status and `"ok"` status in response.

## Deployment Checklist

Before deploying to production:

1. ✅ Set `SENTRY_DSN` environment variable
2. ✅ Configure uptime monitoring for `/api/health`
3. ✅ Run `pnpm test` locally to ensure tests pass
4. ✅ Run `pnpm exec tsc --noEmit` to check types
5. ✅ Run `pnpm build` to ensure build succeeds
6. ✅ Set up CI/CD pipeline in GitHub Actions

## Troubleshooting

### CI Pipeline Fails

1. **TypeScript Errors**: Run `pnpm exec tsc --noEmit` locally to see detailed errors
2. **Test Failures**: Run `pnpm test` locally and check test output
3. **Build Errors**: Run `pnpm build` locally to debug

### Sentry Not Working

1. Check that `SENTRY_DSN` is set correctly
2. Verify the DSN format: `https://xxx@sentry.io/yyy`
3. Check Sentry project settings for correct DSN

### Tests Not Running

1. Ensure dependencies are installed: `pnpm install`
2. Check Jest configuration in `jest.config.cjs`
3. Run tests individually: `pnpm test tests/health.test.ts`

## Contributing

When adding new features:

1. Add unit tests for new functions
2. Add integration tests for new API endpoints
3. Wrap error-prone code with `captureException(error)`
4. Update this documentation if adding new environment variables or setup steps
