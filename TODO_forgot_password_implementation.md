# TODO: Forgot Password Feature Implementation

## Backend Implementation
- [x] Add POST /auth/forgot-password endpoint in Backend/routes/auth.js
  - Accept oldEmail, newEmail, newPassword, confirmPassword in request body
  - Validate inputs and store pending changes
  - Generate reset token and expiry
  - Send verification email to appropriate email (old or new)
- [x] Add POST /auth/reset-password endpoint in Backend/routes/auth.js
  - Accept token in request body
  - Verify token validity and expiry
  - Apply pending password and email changes
  - Clear reset token and pending fields
- [x] Update Backend/models/User.js to include reset token and pending fields
  - Add resetPasswordToken: String
  - Add resetPasswordExpires: Date
  - Add pendingPassword: String
  - Add pendingEmail: String
- [x] Implement email sending functionality
  - Configured nodemailer with Gmail SMTP
  - Email sent with reset link containing token

## Frontend Implementation
- [x] Update Frontend/src/pages/Login.jsx
  - Added "Forgot Password?" Link component below login form
  - Fixed routing to use React Router Link instead of anchor tag
- [x] Create Frontend/src/pages/ForgotPassword.jsx
  - Form with oldEmail, newEmail, newPassword, confirmPassword fields
  - Validation for password match and required fields
  - Submit to /api/auth/forgot-password using authAPI
  - Show success/error messages
- [x] Create Frontend/src/pages/ResetPassword.jsx
  - Extract token from URL params
  - Form for new password and confirm password
  - Submit to /api/auth/reset-password using authAPI
  - Handle success/error messages and redirect to login
- [x] Update Frontend routing in App.jsx
  - Added routes for /forgot-password and /reset-password

## Testing and Verification
- [x] Fixed routing issue in Login.jsx (changed <a href> to <Link>)
- [x] Verified API service uses deployed backend URL
- [x] Implemented comprehensive logging in backend for debugging
- [x] Added proper error handling and validation

## Additional Considerations
- [x] Token expiry implemented (1 hour)
- [x] Password strength validation (minimum 6 characters)
- [x] Email verification routing (sends to old email if same, new email if different)
- [x] Secure token-based confirmation
- [x] Gmail SMTP configuration for email sending
