// Cloudinary configuration - replace with your actual cloud name
window.cloudinaryConfig = {
    cloudName: 'dwp3zume8',
    uploadPreset: 'user-uploads',
    sources: ['local', 'url', 'camera'],
    multiple: false,
    // allow common image, video, document, and audio formats
    // some Cloudinary widget versions read snake_case, others camelCase - provide both
    clientAllowedFormats: ['png','jpg','jpeg','gif','webp','mp4','webm','mov','pdf','doc','docx','ppt','pptx','mp3','wav','ogg','m4a'],
    client_allowed_formats: ['png','jpg','jpeg','gif','webp','mp4','webm','mov','pdf','doc','docx','ppt','pptx','mp3','wav','ogg','m4a'],
    // allow Cloudinary to detect resource type automatically (image/video/raw)
    resource_type: 'auto',
    maxFileSize: 100000000
};