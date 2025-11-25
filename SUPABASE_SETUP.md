# 🗄️ دليل إعداد Supabase

## الخطوة 1: إنشاء مشروع Supabase

### 1. التسجيل في Supabase
1. اذهب إلى: [supabase.com](https://supabase.com)
2. اضغط **Start your project**
3. سجل دخول باستخدام **GitHub**

### 2. إنشاء مشروع جديد
1. اضغط **New Project**
2. املأ البيانات:
   - **Name**: `telegram-file-manager`
   - **Database Password**: اختر كلمة مرور قوية (احفظها!)
   - **Region**: اختر أقرب منطقة لك
3. اضغط **Create new project**
4. انتظر 2-3 دقائق حتى يجهز المشروع

---

## الخطوة 2: إنشاء جدول الملفات

### الطريقة الأولى: SQL Editor (الأسهل)

1. من لوحة التحكم، اذهب إلى **SQL Editor**
2. اضغط **New query**
3. انسخ محتوى ملف `supabase-setup.sql` كاملاً
4. الصقه في المحرر
5. اضغط **Run** (أو Ctrl+Enter)
6. ستظهر رسالة نجاح: ✅ **Success. No rows returned**

### الطريقة الثانية: Table Editor (يدوياً)

إذا فضلت الطريقة اليدوية:

1. اذهب إلى **Table Editor**
2. اضغط **Create a new table**
3. اسم الجدول: `files`
4. أضف الأعمدة التالية:

| Column Name | Type | Default | Extra |
|:------------|:-----|:--------|:------|
| `id` | `int8` | Auto | Primary Key |
| `file_name` | `text` | - | Required |
| `file_type` | `text` | - | Required |
| `file_size` | `int8` | - | Required |
| `telegram_file_id` | `text` | - | Required |
| `telegram_url` | `text` | - | Required |
| `message_id` | `int8` | - | Required |
| `chat_id` | `text` | - | Required |
| `mime_type` | `text` | - | Optional |
| `created_at` | `timestamptz` | `now()` | - |
| `updated_at` | `timestamptz` | `now()` | - |

5. اضغط **Save**

---

## الخطوة 3: الحصول على مفاتيح API

### 1. انتقل إلى Settings
من القائمة الجانبية، اذهب إلى **Settings** > **API**

### 2. انسخ المفاتيح التالية:

#### أ. Project URL
```
https://xxxxxxxxxx.supabase.co
```
احفظه كـ `SUPABASE_URL`

#### ب. anon public Key
```
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```
احفظه كـ `SUPABASE_ANON_KEY`

⚠️ **مهم**: هذه المفاتيح آمنة للاستخدام في Frontend لأن RLS مفعّل.

---

## الخطوة 4: إضافة المفاتيح إلى Railway

### في لوحة تحكم Railway:

1. اذهب إلى **Variables**
2. أضف المتغيرات التالية:

```
SUPABASE_URL = https://xxxxxxxxxx.supabase.co
SUPABASE_ANON_KEY = eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

3. احفظ التغييرات
4. سيعيد Railway نشر المشروع تلقائياً

---

## الخطوة 5: التحقق من الإعداد

### 1. فحص الجدول
1. اذهب إلى **Table Editor** في Supabase
2. افتح جدول `files`
3. يجب أن يكون فارغاً الآن (0 rows)

### 2. فحص الفهارس (Indexes)
1. اذهب إلى **Database** > **Indexes**
2. يجب أن ترى:
   - `idx_files_created_at`
   - `idx_files_file_name`
   - `idx_files_file_type`
   - `idx_files_message_id`

### 3. فحص RLS (Row Level Security)
1. اذهب إلى **Authentication** > **Policies**
2. يجب أن ترى 3 سياسات:
   - Allow public read access
   - Allow public insert access
   - Allow public delete access

---

## 🎯 الخلاصة

بعد إكمال هذه الخطوات، لديك:

- ✅ مشروع Supabase جاهز
- ✅ جدول `files` مع جميع الأعمدة
- ✅ فهارس للبحث السريع
- ✅ RLS مفعّل للحماية
- ✅ مفاتيح API جاهزة

---

## 🔒 ملاحظات أمنية

### الآن (للتجربة):
- ✅ RLS مفعّل لكن السياسات تسمح للجميع
- ✅ مناسب للتجربة والتطوير

### لاحقاً (للإنتاج):
يجب تعديل السياسات لتتطلب مصادقة:

```sql
-- حذف السياسات القديمة
DROP POLICY "Allow public read access" ON files;
DROP POLICY "Allow public insert access" ON files;
DROP POLICY "Allow public delete access" ON files;

-- إضافة سياسات جديدة تتطلب مصادقة
CREATE POLICY "Authenticated users can read" ON files
    FOR SELECT
    USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can insert" ON files
    FOR INSERT
    WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can delete" ON files
    FOR DELETE
    USING (auth.role() = 'authenticated');
```

---

## 📊 مراقبة الاستخدام

### في Supabase Dashboard:
- **Database**: حجم قاعدة البيانات
- **API**: عدد الطلبات
- **Storage**: المساحة المستخدمة (إذا استخدمت Supabase Storage)

### الحدود المجانية:
- ✅ 500 MB Database
- ✅ 1 GB File Storage
- ✅ 2 GB Bandwidth
- ✅ 50,000 Monthly Active Users

---

## 🐛 حل المشاكل

### المشكلة: "relation files does not exist"
**الحل**: لم يتم إنشاء الجدول. أعد تشغيل `supabase-setup.sql`

### المشكلة: "permission denied"
**الحل**: تحقق من سياسات RLS. تأكد أن السياسات موجودة.

### المشكلة: "invalid API key"
**الحل**: تأكد من نسخ `anon public` key وليس `service_role` key

---

**الآن جاهز للخطوة التالية: تعديل Backend! 🚀**
