// ═══════════════════════════════════════════════════════
// Telegram File Uploader - Backend Server v2.0
// مع دعم Supabase لإدارة الملفات
// ═══════════════════════════════════════════════════════

const express = require('express');
const multer = require('multer');
const fetch = require('node-fetch');
const FormData = require('form-data');
const cors = require('cors');
const path = require('path');

// استيراد وظائف Supabase
const {
  saveFile,
  getAllFiles,
  searchFiles,
  deleteFile,
  getStats,
  getFileType,
  isConfigured: isSupabaseConfigured
} = require('./supabase');

// إنشاء التطبيق
const app = express();
const PORT = process.env.PORT || 3000;

// المتغيرات البيئية
const BOT_TOKEN = process.env.BOT_TOKEN || 'YOUR_BOT_TOKEN';
const CHAT_ID = process.env.CHAT_ID || 'YOUR_CHAT_ID';

// إعدادات
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// إعداد Multer لرفع الملفات
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 50 * 1024 * 1024 // 50 MB
  }
});

// ═══════════════════════════════════════════════════════
// المسارات (Routes)
// ═══════════════════════════════════════════════════════

// الصفحة الرئيسية
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// صفحة المعرض
app.get('/gallery', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'gallery.html'));
});

// فحص صحة الإعدادات
app.get('/health', (req, res) => {
  const isTelegramConfigured = BOT_TOKEN !== 'YOUR_BOT_TOKEN' && CHAT_ID !== 'YOUR_CHAT_ID';
  const supabaseConfigured = isSupabaseConfigured();
  
  res.json({
    status: 'running',
    telegram: {
      configured: isTelegramConfigured,
      message: isTelegramConfigured 
        ? 'تيليجرام مُعد بشكل صحيح ✓' 
        : 'يرجى تعيين BOT_TOKEN و CHAT_ID'
    },
    supabase: {
      configured: supabaseConfigured,
      message: supabaseConfigured
        ? 'Supabase مُعد بشكل صحيح ✓'
        : 'Supabase غير مُعد - سيعمل المشروع بدون حفظ البيانات'
    }
  });
});

// رفع الملف إلى تيليجرام (مع حفظ في Supabase)
app.post('/upload', upload.single('file'), async (req, res) => {
  try {
    // التحقق من وجود الملف
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'لم يتم إرسال ملف'
      });
    }

    // التحقق من إعدادات تيليجرام
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
        const channelId = CHAT_ID.replace('-100', '');
        fileUrl = `https://t.me/c/${channelId}/${messageId}`;
      } else {
        fileUrl = `https://t.me/${result.result.chat.username || 'telegram'}`;
      }

      console.log(`✓ تم الرفع بنجاح: ${file.originalname}`);

      // حفظ معلومات الملف في Supabase
      const fileData = {
        file_name: file.originalname,
        file_type: getFileType(file.mimetype),
        file_size: file.size,
        telegram_file_id: fileId,
        telegram_url: fileUrl,
        message_id: messageId,
        chat_id: CHAT_ID,
        mime_type: file.mimetype
      };

      const saveResult = await saveFile(fileData);
      
      if (!saveResult.success) {
        console.warn('⚠️ تحذير: تم رفع الملف لكن لم يتم حفظه في قاعدة البيانات');
      }

      res.json({
        success: true,
        file_id: fileId,
        file_url: fileUrl,
        file_name: file.originalname,
        file_size: file.size,
        message: 'تم رفع الملف بنجاح! ✓',
        saved_to_db: saveResult.success
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

// الحصول على جميع الملفات
app.get('/api/files', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 100;
    const offset = parseInt(req.query.offset) || 0;

    const result = await getAllFiles(limit, offset);

    if (result.success) {
      res.json({
        success: true,
        files: result.data,
        total: result.count,
        limit,
        offset
      });
    } else {
      res.status(500).json({
        success: false,
        error: result.error
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// البحث عن ملفات
app.get('/api/files/search', async (req, res) => {
  try {
    const query = req.query.q || '';

    if (!query) {
      return res.status(400).json({
        success: false,
        error: 'يرجى إدخال كلمة بحث'
      });
    }

    const result = await searchFiles(query);

    if (result.success) {
      res.json({
        success: true,
        files: result.data,
        query
      });
    } else {
      res.status(500).json({
        success: false,
        error: result.error
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// حذف ملف
app.delete('/api/files/:id', async (req, res) => {
  try {
    const fileId = parseInt(req.params.id);

    // حذف من قاعدة البيانات والحصول على معلومات الملف
    const result = await deleteFile(fileId);

    if (!result.success) {
      return res.status(500).json({
        success: false,
        error: result.error
      });
    }

    const fileData = result.data;

    // حذف الرسالة من تيليجرام
    try {
      const telegramUrl = `https://api.telegram.org/bot${BOT_TOKEN}/deleteMessage`;
      const telegramResponse = await fetch(telegramUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: fileData.chat_id,
          message_id: fileData.message_id
        })
      });

      const telegramResult = await telegramResponse.json();

      if (!telegramResult.ok) {
        console.warn('⚠️ تحذير: تم حذف الملف من قاعدة البيانات لكن لم يتم حذفه من تيليجرام');
      } else {
        console.log('✓ تم حذف الملف من تيليجرام أيضاً');
      }
    } catch (telegramError) {
      console.warn('⚠️ خطأ في حذف الملف من تيليجرام:', telegramError.message);
    }

    res.json({
      success: true,
      message: 'تم حذف الملف بنجاح',
      file: fileData
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// الحصول على إحصائيات
app.get('/api/stats', async (req, res) => {
  try {
    const result = await getStats();

    if (result.success) {
      res.json({
        success: true,
        stats: result.data
      });
    } else {
      res.status(500).json({
        success: false,
        error: result.error
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
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
  console.log('🚀 Telegram File Manager Server v2.0');
  console.log('═══════════════════════════════════════════════════════');
  console.log(`📡 الخادم يعمل على: http://localhost:${PORT}`);
  console.log(`🔧 البيئة: ${process.env.NODE_ENV || 'development'}`);
  console.log(`✓ BOT_TOKEN: ${BOT_TOKEN !== 'YOUR_BOT_TOKEN' ? 'مُعد ✓' : 'غير مُعد ✗'}`);
  console.log(`✓ CHAT_ID: ${CHAT_ID !== 'YOUR_CHAT_ID' ? 'مُعد ✓' : 'غير مُعد ✗'}`);
  console.log(`✓ Supabase: ${isSupabaseConfigured() ? 'مُعد ✓' : 'غير مُعد (اختياري)'}`);
  console.log('═══════════════════════════════════════════════════════');
});

// معالجة الأخطاء غير المتوقعة
process.on('uncaughtException', (error) => {
  console.error('❌ خطأ غير متوقع:', error);
});

process.on('unhandledRejection', (error) => {
  console.error('❌ رفض غير معالج:', error);
});
