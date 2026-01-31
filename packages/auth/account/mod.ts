// Account module exports
// Self-service account management routes and views

export {
  type AccountRouteContext,
  type AccountRouteContextWith2FA,
  handle2FADisable,
  handle2FAEnable,
  handle2FASetupForm,
  handleAccountPage,
  handlePasswordChange,
  handlePasswordChangeForm,
  has2FAEnabled,
} from './routes.ts';

export {
  accountStyles,
  render2FADisablePage,
  render2FASetupPage,
  renderAccountPage,
  renderPasswordChangePage,
} from './views.ts';
