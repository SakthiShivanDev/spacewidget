export const integrationChoices = [
  [
    "authLogin",
    "Sign in with email",
    { email: { required: true }, password: { required: true } },
  ],
  [
    "authRegister",
    "Create an account",
    {
      name: { required: true },
      email: { required: true },
      password: { required: true },
    },
  ],
  ["authLogout", "Sign out", {}],
  [
    "authRequestReset",
    "Send password reset code",
    { email: { required: true } },
  ],
  [
    "authResetPassword",
    "Reset password",
    {
      email: { required: true },
      code: { required: true },
      password: { required: true },
    },
  ],
  [
    "authRequestOtp",
    "Send email verification code",
    { email: { required: true } },
  ],
  [
    "authVerifyOtp",
    "Verify email code",
    { email: { required: true }, code: { required: true } },
  ],
  ["authOAuth", "Continue with Google", {}],
  ["authApple", "Continue with Apple", {}],
  [
    "openExternalApp",
    "Open an approved external app",
    {
      name: {
        required: true,
        description: "Name saved in Integrations → External apps",
      },
    },
  ],
  ["openUrl", "Open a website", { url: { required: true } }],
  [
    "checkout",
    "Open hosted checkout",
    {
      url: {
        required: true,
        description: "Checkout URL returned by your payment API",
      },
      sessionId: {},
    },
  ],
  ["pickFiles", "Choose files", {}],
  ["capturePhoto", "Take a photo", {}],
  ["upload", "Upload a file", null],
  ["pushRegister", "Enable push notifications", {}],
  ["pushUnregister", "Disable push notifications", {}],
];
