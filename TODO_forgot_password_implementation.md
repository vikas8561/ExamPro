# TODO: Forgot Password Feature Implementation

## Backend Implementation
- [x] Add POST /auth/forgot-password endpoint in Backend/routes/auth.js
  - Accept oldEmail, newEmail, newPassword, confirmPassword in request body
  - Validate inputs and password match
  - Generate reset token and expiry
  - Save token and pending changes to user model
  - Send reset email with token link to appropriate email (old or new)
- [x] Add POST /auth/reset-password endpoint in Backend/routes/auth.js
  - Accept token in request body
  - Verify token validity and expiry
  - Apply pending password and email changes
  - Clear reset token and pending fields
- [x] Update Backend/models/User.js to include reset token and pending change fields
  - Add resetPasswordToken: String
  - Add resetPasswordExpires: Date
  - Add pendingPassword: String
  - Add pendingEmail: String
- [x] Implement email sending functionality using nodemailer
  - Configure SMTP settings
  - Create email template for password reset
  - Send email with reset link

## Frontend Implementation
- [x] Update Frontend/src/pages/Login.jsx
  - Add "Forgot Password?" link below login form
  - Link to /forgot-password route
- [x] Create Frontend/src/pages/ForgotPassword.jsx
  - Form with oldEmail, newEmail, newPassword, confirmPassword inputs
  - Submit to /api/auth/forgot-password
  - Show success message after submission
- [x] Create Frontend/src/pages/ResetPassword.jsx
  - Extract token from URL params
  - Confirmation button to submit token to /api/auth/reset-password
  - Show success or error messages
- [x] Update Frontend/src/App.jsx
  - Add routes for /forgot-password and /reset-password

## Testing and Verification
- [ ] Test forgot password flow end-to-end
- [ ] Test reset password with valid token
- [ ] Test reset password with expired/invalid token
- [ ] Test email sending functionality
- [ ] Verify password hashing and security

## Additional Considerations
- [ ] Add rate limiting to prevent abuse
- [ ] Implement token expiry (e.g., 1 hour)
- [ ] Add password strength validation
- [ ] Handle edge cases (user not found, invalid token, etc.)
