# Smart Notes Backend

## Email Configuration

### Gmail Setup
1. Enable 2-factor authentication on your Gmail account
2. Generate an App Password:
   - Go to Google Account settings
   - Security → 2-Step Verification → App passwords
   - Generate password for "Smart Notes"
3. Add to your `.env` file:
   ```
   EMAIL_USER=your-email@gmail.com
   EMAIL_PASSWORD=your-16-digit-app-password
   FRONTEND_URL=http://localhost:3000
   ```

### Other Email Providers
You can modify the email service configuration in `services/emailService.js` to use other providers like Outlook, SendGrid, etc.

## Features
- Note sharing email notifications
- Welcome emails for new users
- HTML email templates with responsive design
- Graceful error handling (sharing works even if email fails)
