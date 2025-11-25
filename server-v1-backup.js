// ═══════════════════════════════════════════════════════
// Telegram File Uploader - Backend Server
// ═══════════════════════════════════════════════════════

const express = require('express');
const multer = require('multer');
const fetch = require('node-fetch');
const FormData = require('form-data');
const cors = require('cors');
const path = require('path');

// إنشاء التطبيق
const app = express();
const PORT = process.env.PORT || 3000;

// المتغيرات البيئية (ستضعها في Railway)
const BOT_TOKEN = process.env.BOT_TOKEN || 'YOUR_BOT_TOKEN';
const CHAT_ID = process.env.CHAT_ID || 'YOUR_CHAT_ID';

// إعدادات
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// إعداد Multer لرفع الملفات (تخزين مؤقت في الذاكرة)
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 50 * 1024 * 1024 // 50 MB (حد تيليجرام للبوتات)
  }
});

// ═══════════════════════════════════════════════════════
// المسارات (Routes)
// ═══════════════════════════════════════════════════════

// الصفحة الرئيسية
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// فحص صحة الإعدادات
app.get('/health', (req, res) => {
  const isConfigured = BOT_TOKEN !== 'YOUR_BOT_TOKEN' && CHAT_ID !== 'YOUR_CHAT_ID';
  res.json({
    status: 'running',
    configured: isConfigured,
    message: isConfigured 
      ? 'الخادم يعمل بشكل صحيح ✓' 
      : 'يرجى تعيين BOT_TOKEN و CHAT_ID في المتغيرات البيئية'
  });
});

// رفع الملف إلى تيليجرام
app.post('/upload', upload.single('file'), async (req, res) => {
  try {
    // التحقق من وجود الملف
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'لم يتم إرسال ملف'
      });
    }

    // التحقق من الإعدادات
    if (BOT_TOKEN === 'YOUR_BOT_TOKEN' || CHAT_ID === 'YOUR_CHAT_ID') {
      return res.status(500).json({
        success: false,
        error: 'الخادم غير مُعد بشكل صحيح. يرجى تعيين BOT_TOKEN و CHAT_ID'
      });
    }

    const file = req.file;
    console.log(`📤 جاري رفع: ${file.originalname} (${formatBytes(file.size)})`);

    // إعداد FormData لإرسالها إلى تيليجرام
    const formData = new FormData();
    formData.append('chat_id', CHAT_ID);
    formData.append('document', file.buffer, {
      filename: file.originalname,
      contentType: file.mimetype
    });
    formData.append('caption', `📁 ${file.originalname}\n📊 الحجم: ${formatBytes(file.size)}`);

    // إرسال الملف إلى تيليجرام
    const telegramUrl = `https://api.telegram.org/bot${BOT_TOKEN}/sendDocument`;
    const response = await fetch(telegramUrl, {
      method: 'POST',
      body: formData,
      headers: formData.getHeaders()
    });

    const result = await response.json();

    if (result.ok) {
      const fileId = result.result.document.file_id;
      const messageId = result.result.message_id;
      
      // إنشاء رابط للملف
      let fileUrl = '';
      if (CHAT_ID.startsWith('-100')) {
        // قناة
        const channelId = CHAT_ID.replace('-100', '');
        fileUrl = `https://t.me/c/${channelId}/${messageId}`;
      } else {
        // محادثة خاصة
        fileUrl = `https://t.me/${result.result.chat.username || 'telegram'}`;
      }

      console.log(`✓ تم الرفع بنجاح: ${file.originalname}`);

      res.json({
        success: true,
        file_id: fileId,
        file_url: fileUrl,
        file_name: file.originalname,
        file_size: file.size,
        message: 'تم رفع الملف بنجاح! ✓'
      });
    } else {
      console.error('❌ خطأ من تيليجرام:', result.description);
      res.status(500).json({
        success: false,
        error: `خطأ من تيليجرام: ${result.description}`
      });
    }

  } catch (error) {
    console.error('❌ خطأ في الخادم:', error.message);
    res.status(500).json({
      success: false,
      error: `خطأ في الخادم: ${error.message}`
    });
  }
});

// ═══════════════════════════════════════════════════════
// دوال مساعدة
// ═══════════════════════════════════════════════════════

function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

// ═══════════════════════════════════════════════════════
// تشغيل الخادم
// ═══════════════════════════════════════════════════════

app.listen(PORT, () => {
  console.log('═══════════════════════════════════════════════════════');
  console.log('🚀 Telegram File Uploader Server');
  console.log('═══════════════════════════════════════════════════════');
  console.log(`📡 الخادم يعمل على: http://localhost:${PORT}`);
  console.log(`🔧 البيئة: ${process.env.NODE_ENV || 'development'}`);
  console.log(`✓ BOT_TOKEN: ${BOT_TOKEN !== 'YOUR_BOT_TOKEN' ? 'مُعد ✓' : 'غير مُعد ✗'}`);
  console.log(`✓ CHAT_ID: ${CHAT_ID !== 'YOUR_CHAT_ID' ? 'مُعد ✓' : 'غير مُعد ✗'}`);
  console.log('═══════════════════════════════════════════════════════');
});

// معالجة الأخطاء غير المتوقعة
process.on('uncaughtException', (error) => {
  console.error('❌ خطأ غير متوقع:', error);
});

process.on('unhandledRejection', (error) => {
  console.error('❌ رفض غير معالج:', error);
});
