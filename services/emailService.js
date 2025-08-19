const nodemailer = require('nodemailer');

class EmailService {
  constructor() {
    this.transporter = this.createTransporter();
  }

  createTransporter() {
    // Check if using SendGrid
    if (process.env.SENDGRID_API_KEY) {
      return nodemailer.createTransport({
        service: 'SendGrid',
        auth: {
          user: 'apikey',
          pass: process.env.SENDGRID_API_KEY
        }
      });
    }

    // Check if using custom SMTP
    if (process.env.SMTP_HOST) {
      return nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: process.env.SMTP_PORT || 587,
        secure: process.env.SMTP_SECURE === 'true',
        auth: {
          user: process.env.EMAIL_USER,
          pass: process.env.EMAIL_PASSWORD
        }
      });
    }

    // Default to Gmail/general service
    const service = process.env.EMAIL_SERVICE || 'gmail';
    return nodemailer.createTransport({
      service: service,
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASSWORD
      }
    });
  }

  async sendNoteSharedEmail(recipientEmail, senderName, noteTitle, noteId, permission) {
    const appUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const noteUrl = `${appUrl}/notes/${noteId}`;
    
    const permissionText = {
      'read': 'view',
      'write': 'edit',
      'admin': 'manage'
    }[permission] || 'access';

    const mailOptions = {
      from: `"Smart Notes" <${process.env.EMAIL_USER}>`,
      to: recipientEmail,
      subject: `${senderName} shared a note with you - Smart Notes`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background-color: #1976d2; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
            .content { background-color: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px; }
            .button { display: inline-block; background-color: #1976d2; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; margin: 20px 0; }
            .note-info { background-color: white; padding: 15px; border-radius: 5px; margin: 15px 0; border-left: 4px solid #1976d2; }
            .footer { text-align: center; margin-top: 30px; color: #666; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>📝 Smart Notes</h1>
            </div>
            <div class="content">
              <h2>You've been invited to collaborate!</h2>
              <p>Hi there!</p>
              <p><strong>${senderName}</strong> has shared a note with you and given you <strong>${permission}</strong> access to ${permissionText} it.</p>
              
              <div class="note-info">
                <h3>📄 Note Details:</h3>
                <p><strong>Title:</strong> ${noteTitle}</p>
                <p><strong>Permission Level:</strong> ${permission.charAt(0).toUpperCase() + permission.slice(1)}</p>
                <p><strong>Shared by:</strong> ${senderName}</p>
              </div>

              <p>Click the button below to view the note:</p>
              <a href="${noteUrl}" class="button">Open Note</a>
              
              <p>Or copy and paste this link into your browser:</p>
              <p style="word-break: break-all; background-color: #e3f2fd; padding: 10px; border-radius: 3px;">${noteUrl}</p>
              
              <p><strong>What you can do:</strong></p>
              <ul>
                ${permission === 'read' ? '<li>View the note content</li>' : ''}
                ${permission === 'write' || permission === 'admin' ? '<li>View and edit the note content</li>' : ''}
                ${permission === 'write' || permission === 'admin' ? '<li>See real-time changes from other collaborators</li>' : ''}
                ${permission === 'admin' ? '<li>Share the note with others</li>' : ''}
                ${permission === 'admin' ? '<li>Manage permissions for other collaborators</li>' : ''}
              </ul>
              
              <p>Happy collaborating!</p>
              <p>The Smart Notes Team</p>
            </div>
            <div class="footer">
              <p>This email was sent because someone shared a Smart Notes document with you.</p>
              <p>If you didn't expect this email, you can safely ignore it.</p>
            </div>
          </div>
        </body>
        </html>
      `
    };

    try {
      await this.transporter.sendMail(mailOptions);
      console.log(`Note sharing email sent to ${recipientEmail}`);
      return { success: true };
    } catch (error) {
      console.error('Error sending email:', error);
      throw new Error('Failed to send notification email');
    }
  }

  async sendWelcomeEmail(userEmail, userName) {
    const appUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    
    const mailOptions = {
      from: `"Smart Notes" <${process.env.EMAIL_USER}>`,
      to: userEmail,
      subject: 'Welcome to Smart Notes!',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background-color: #1976d2; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
            .content { background-color: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px; }
            .button { display: inline-block; background-color: #1976d2; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; margin: 20px 0; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>📝 Welcome to Smart Notes!</h1>
            </div>
            <div class="content">
              <h2>Hello ${userName}!</h2>
              <p>Welcome to Smart Notes - your intelligent collaborative note-taking platform!</p>
              <p>You can now:</p>
              <ul>
                <li>Create and edit notes with our rich text editor</li>
                <li>Collaborate in real-time with others</li>
                <li>Get AI-powered writing assistance</li>
                <li>Share notes with granular permissions</li>
                <li>Track version history</li>
              </ul>
              <a href="${appUrl}" class="button">Start Taking Notes</a>
              <p>Happy note-taking!</p>
              <p>The Smart Notes Team</p>
            </div>
          </div>
        </body>
        </html>
      `
    };

    try {
      await this.transporter.sendMail(mailOptions);
      console.log(`Welcome email sent to ${userEmail}`);
      return { success: true };
    } catch (error) {
      console.error('Error sending welcome email:', error);
      // Don't throw error for welcome emails, just log it
      return { success: false, error: error.message };
    }
  }
}

module.exports = new EmailService();
