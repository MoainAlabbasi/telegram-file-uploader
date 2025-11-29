# 🏗️ تصميم البنية التحتية للتحديثات الجديدة

## 📋 نظرة عامة

هذا المستند يحدد البنية التحتية الكاملة للتحديثات المطلوبة:
1. نظام إنشاء وإدارة الاختبارات
2. تطوير ميزة الملخصات مع عارض متدفق
3. نظام تصدير متعدد الصيغ

---

## 🗄️ تحديثات قاعدة البيانات

### جدول الاختبارات (quizzes)

```sql
CREATE TABLE IF NOT EXISTS quizzes (
    id BIGSERIAL PRIMARY KEY,
    quiz_name TEXT NOT NULL,
    telegram_file_id TEXT NOT NULL,
    source_file_id BIGINT REFERENCES files(id) ON DELETE CASCADE,
    source_file_name TEXT NOT NULL,
    question_count INTEGER DEFAULT 0,
    total_score INTEGER DEFAULT 0,
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

### جدول الملخصات المحسّن (file_summaries)

الجدول موجود بالفعل، لكن سنضيف حقول إضافية:

```sql
ALTER TABLE file_summaries ADD COLUMN IF NOT EXISTS summary_name TEXT;
ALTER TABLE file_summaries ADD COLUMN IF NOT EXISTS word_count INTEGER DEFAULT 0;
ALTER TABLE file_summaries ADD COLUMN IF NOT EXISTS metadata JSONB;
```

---

## 🎨 واجهة المستخدم

### 1. صفحة إنشاء الاختبارات (quiz-creator.html)

**المسار**: `/quiz-creator`

**الميزات**:
- نموذج تفاعلي لإنشاء الاختبارات
- اختيار عدد الأسئلة الرئيسية
- تحديد نوع كل سؤال (مطابقة، ترتيب، إكمال، تعريف، صواب/خطأ، اختيار متعدد)
- تحديد الدرجة لكل سؤال
- زر "+" لإضافة أسئلة إضافية ديناميكياً
- معاينة مباشرة للاختبار
- حفظ الاختبار كملف Markdown في Telegram

### 2. صفحة عرض الاختبارات (quizzes.html)

**المسار**: `/quizzes`

**الميزات**:
- قائمة بجميع الاختبارات المحفوظة
- عرض التفاصيل (الاسم، الملف المصدر، التاريخ، عدد الأسئلة)
- فلترة وبحث في الاختبارات
- فتح الاختبار في العارض المخصص

### 3. العارض المتدفق (viewer.html)

**المسار**: `/viewer/:type/:id` (type: quiz أو summary)

**الميزات**:
- عرض محتوى الاختبار/الملخص بشكل جميل
- استخدام تقنية Streaming لتحميل المحتوى من Telegram
- واجهة HTML مخصصة مع تنسيق Markdown
- شريط أدوات للتصدير بصيغ متعددة

### 4. تحديث صفحة الملخصات (summaries.html)

**المسار**: `/summaries`

**الميزات**:
- قائمة بجميع الملخصات المحفوظة
- عرض التفاصيل (الاسم، الملف المصدر، التاريخ، عدد الكلمات)
- فلترة وبحث في الملخصات
- فتح الملخص في العارض المخصص

---

## 🔧 API Endpoints الجديدة

### 1. إنشاء اختبار

```
POST /api/quiz/create
Body: {
  sourceFileId: number,
  quizName: string,
  questions: [
    {
      type: string,
      question: string,
      options?: string[],
      answer: string,
      score: number
    }
  ]
}
Response: {
  success: boolean,
  quizId: number,
  telegramFileId: string
}
```

### 2. إنشاء اختبار بالذكاء الاصطناعي

```
POST /api/quiz/generate-ai
Body: {
  sourceFileId: number,
  questionCount: number,
  questionTypes: string[]
}
Response: {
  success: boolean,
  quizId: number,
  content: string
}
```

### 3. الحصول على جميع الاختبارات

```
GET /api/quizzes?limit=50&offset=0
Response: {
  success: boolean,
  quizzes: Array<Quiz>,
  count: number
}
```

### 4. الحصول على اختبار محدد

```
GET /api/quiz/:id
Response: {
  success: boolean,
  quiz: Quiz,
  content: string (streamed from Telegram)
}
```

### 5. حذف اختبار

```
DELETE /api/quiz/:id
Response: {
  success: boolean
}
```

### 6. الحصول على جميع الملخصات

```
GET /api/summaries?limit=50&offset=0
Response: {
  success: boolean,
  summaries: Array<Summary>,
  count: number
}
```

### 7. الحصول على ملخص محدد

```
GET /api/summary/:fileId
Response: {
  success: boolean,
  summary: Summary,
  content: string (streamed from Telegram)
}
```

### 8. تصدير محتوى

```
POST /api/export
Body: {
  content: string,
  format: 'docx' | 'pdf' | 'xlsx' | 'pptx' | 'txt' | 'md',
  filename: string
}
Response: File download (streamed)
```

---

## 📊 هيكل البيانات

### Quiz Object

```typescript
interface Quiz {
  id: number;
  quiz_name: string;
  telegram_file_id: string;
  source_file_id: number;
  source_file_name: string;
  question_count: number;
  total_score: number;
  metadata: {
    questionTypes: string[];
    averageScore?: number;
    difficulty?: string;
  };
  created_at: string;
  updated_at: string;
}
```

### Summary Object

```typescript
interface Summary {
  id: number;
  file_id: number;
  telegram_summary_id: string;
  summary_name: string;
  word_count: number;
  metadata: {
    language?: string;
    summaryType?: string;
  };
  created_at: string;
}
```

### Question Object

```typescript
interface Question {
  type: 'multiple_choice' | 'true_false' | 'matching' | 'ordering' | 'fill_blank' | 'definition';
  question: string;
  options?: string[];
  answer: string;
  score: number;
  explanation?: string;
}
```

---

## 🔄 تدفق العمل (Workflow)

### إنشاء اختبار يدوي

1. المستخدم يفتح صفحة `/quiz-creator`
2. يختار ملف مصدر من القائمة
3. يدخل اسم الاختبار
4. يحدد عدد الأسئلة الرئيسية
5. لكل سؤال:
   - يختار النوع
   - يدخل السؤال
   - يدخل الخيارات (إن وجدت)
   - يدخل الإجابة الصحيحة
   - يحدد الدرجة
6. يمكنه إضافة أسئلة إضافية بالضغط على "+"
7. يضغط "إنشاء الاختبار"
8. النظام:
   - يحول البيانات إلى Markdown
   - يرفع الملف إلى Telegram
   - يحفظ البيانات في جدول `quizzes`
   - يعرض رسالة نجاح مع رابط للعرض

### إنشاء اختبار بالذكاء الاصطناعي

1. المستخدم يفتح صفحة `/study` (الموجودة)
2. يختار ملف ويضغط "❓ اختبار"
3. يظهر نموذج لتحديد:
   - عدد الأسئلة
   - أنواع الأسئلة المطلوبة
4. النظام:
   - يستدعي Gemini API
   - يولد الاختبار بصيغة Markdown
   - يرفع الملف إلى Telegram
   - يحفظ البيانات في جدول `quizzes`
   - يعرض الاختبار في العارض

### عرض اختبار/ملخص

1. المستخدم يفتح `/viewer/quiz/:id` أو `/viewer/summary/:id`
2. النظام:
   - يجلب معلومات الاختبار/الملخص من قاعدة البيانات
   - يحصل على `telegram_file_id`
   - يستخدم Telegram Bot API لجلب محتوى الملف
   - يستخدم `stream.pipe()` لبث المحتوى مباشرة إلى المتصفح
   - يعرض المحتوى في واجهة HTML مخصصة
3. المستخدم يمكنه:
   - قراءة المحتوى
   - تصدير بصيغة معينة

### تصدير محتوى

1. المستخدم يضغط على زر التصدير (مثلاً "تنزيل PDF")
2. النظام:
   - يرسل طلب POST إلى `/api/export`
   - يستدعي `converter.py` مع الصيغة المطلوبة
   - يحول المحتوى من Markdown إلى الصيغة المطلوبة
   - يرسل الملف المحول كـ download stream
3. المتصفح يحمل الملف تلقائياً

---

## 🚀 التحسينات والأداء

### 1. Streaming للملفات الكبيرة

بدلاً من تحميل الملف بالكامل في الذاكرة:

```javascript
// في server.js
app.get('/api/content/:type/:id', async (req, res) => {
  const { type, id } = req.params;
  
  // جلب telegram_file_id من قاعدة البيانات
  const fileId = await getTelegramFileId(type, id);
  
  // جلب مسار الملف من Telegram
  const fileInfo = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getFile?file_id=${fileId}`);
  const fileData = await fileInfo.json();
  
  // بث المحتوى مباشرة
  const fileStream = await fetch(`https://api.telegram.org/file/bot${BOT_TOKEN}/${fileData.result.file_path}`);
  res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
  fileStream.body.pipe(res);
});
```

### 2. Caching للملخصات

الملخصات موجودة بالفعل في جدول `file_summaries`، لذا لن نحتاج لإعادة توليدها.

### 3. معالجة التحويلات بشكل غير متزامن

استخدام `child_process.spawn()` بدلاً من `subprocess.run()` لتحسين الأداء:

```javascript
const { spawn } = require('child_process');

function convertMarkdown(content, format, outputPath) {
  return new Promise((resolve, reject) => {
    const converter = spawn('python3', ['converter.py', '/tmp/input.md', outputPath, format]);
    
    converter.on('close', (code) => {
      if (code === 0) resolve(outputPath);
      else reject(new Error('Conversion failed'));
    });
  });
}
```

---

## 🎯 خطة التنفيذ

### المرحلة 3: تحديثات قاعدة البيانات ووحدة الاختبارات
- إنشاء جدول `quizzes`
- تحديث جدول `file_summaries`
- إضافة دوال قاعدة البيانات في `supabase.js`
- إنشاء API endpoints للاختبارات

### المرحلة 4: واجهة المستخدم والعارض المتدفق
- إنشاء صفحة `quiz-creator.html`
- إنشاء صفحة `quizzes.html`
- إنشاء صفحة `viewer.html`
- إنشاء صفحة `summaries.html`
- تطبيق Streaming في العارض

### المرحلة 5: ميزات التصدير والتحويل
- تحسين `converter.py`
- إضافة endpoint `/api/export`
- إضافة شريط أدوات التصدير في العارض

### المرحلة 6: تحديث ميزة الملخصات
- تحديث API للملخصات
- ربط الملخصات بالعارض الجديد
- إضافة صفحة قائمة الملخصات

### المرحلة 7: الاختبار والتحسينات
- اختبار جميع الميزات
- إصلاح الأخطاء
- تحسين الأداء
- تحسين واجهة المستخدم

### المرحلة 8: التوثيق
- تحديث README.md
- إنشاء دليل المستخدم
- توثيق API
- تعليمات التثبيت

---

## 📦 المكتبات الإضافية المطلوبة

### Node.js (package.json)
```json
{
  "dependencies": {
    "express": "^4.18.2",
    "multer": "^1.4.5-lts.1",
    "node-fetch": "^2.6.7",
    "form-data": "^4.0.0",
    "cors": "^2.8.5",
    "@supabase/supabase-js": "^2.38.0",
    "@google/generative-ai": "^0.1.0"
  }
}
```

### Python (requirements.txt)
```
python-docx>=0.8.11
openpyxl>=3.1.0
fpdf2>=2.7.0
pandoc>=2.3
markdown>=3.4.0
```

### System Dependencies
```bash
# تثبيت pandoc للتحويلات المتقدمة
apt-get install pandoc

# تثبيت خطوط عربية لدعم PDF
apt-get install fonts-arabeyes
```

---

## ✅ معايير النجاح

1. ✅ جدول `quizzes` تم إنشاؤه بنجاح
2. ✅ واجهة إنشاء الاختبارات تعمل بشكل كامل
3. ✅ العارض المتدفق يعرض المحتوى بدون تحميل كامل في الذاكرة
4. ✅ التصدير يعمل لجميع الصيغ (DOCX, PDF, XLSX, PPTX, TXT, MD)
5. ✅ الملخصات تظهر في قائمة منفصلة
6. ✅ الأداء محسّن ولا توجد مشاكل في الذاكرة
7. ✅ واجهة المستخدم احترافية ومتجاوبة
8. ✅ التوثيق شامل وواضح

---

## 🔒 الأمان

- ✅ التحقق من صحة المدخلات في جميع API endpoints
- ✅ استخدام Prepared Statements لمنع SQL Injection
- ✅ التحقق من أنواع الملفات قبل التحويل
- ✅ حد أقصى لحجم المحتوى المعالج
- ✅ Rate Limiting للطلبات الكثيفة
- ✅ تنظيف الملفات المؤقتة بعد التحويل

---

تم إعداد هذا التصميم بعناية لضمان أفضل أداء وتجربة مستخدم ممكنة! 🚀
