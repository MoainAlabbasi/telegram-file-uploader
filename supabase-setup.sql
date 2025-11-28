-- ═══════════════════════════════════════════════════════
-- Supabase Database Setup for Telegram File Manager
-- ═══════════════════════════════════════════════════════

-- إنشاء جدول الملفات
CREATE TABLE IF NOT EXISTS files (
    id BIGSERIAL PRIMARY KEY,
    file_name TEXT NOT NULL,
    file_type TEXT NOT NULL,
    file_size BIGINT NOT NULL,
    telegram_file_id TEXT NOT NULL,
    telegram_url TEXT NOT NULL,
    message_id BIGINT NOT NULL,
    chat_id TEXT NOT NULL,
    mime_type TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- إنشاء فهرس للبحث السريع
CREATE INDEX IF NOT EXISTS idx_files_created_at ON files(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_files_file_name ON files(file_name);
CREATE INDEX IF NOT EXISTS idx_files_file_type ON files(file_type);
CREATE INDEX IF NOT EXISTS idx_files_message_id ON files(message_id);

-- إنشاء دالة لتحديث updated_at تلقائياً
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- إنشاء مشغل (Trigger) لتحديث updated_at
CREATE TRIGGER update_files_updated_at
    BEFORE UPDATE ON files
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- إضافة Row Level Security (RLS) - اختياري للحماية
ALTER TABLE files ENABLE ROW LEVEL SECURITY;

-- سياسة للسماح بالقراءة للجميع (يمكن تعديلها لاحقاً)
CREATE POLICY "Allow public read access" ON files
    FOR SELECT
    USING (true);

-- سياسة للسماح بالإدراج للجميع (يمكن تعديلها لاحقاً)
CREATE POLICY "Allow public insert access" ON files
    FOR INSERT
    WITH CHECK (true);

-- سياسة للسماح بالحذف للجميع (يمكن تعديلها لاحقاً)
CREATE POLICY "Allow public delete access" ON files
    FOR DELETE
    USING (true);

-- إنشاء view لعرض إحصائيات الملفات
CREATE OR REPLACE VIEW files_stats AS
SELECT 
    COUNT(*) as total_files,
    SUM(file_size) as total_size,
    COUNT(DISTINCT file_type) as file_types_count,
    MAX(created_at) as last_upload
FROM files;

-- إضافة تعليقات توضيحية
COMMENT ON TABLE files IS 'جدول تخزين معلومات الملفات المرفوعة إلى تيليجرام';
COMMENT ON COLUMN files.id IS 'المعرف الفريد للملف';
COMMENT ON COLUMN files.file_name IS 'اسم الملف الأصلي';
COMMENT ON COLUMN files.file_type IS 'نوع الملف (image, video, document, audio)';
COMMENT ON COLUMN files.file_size IS 'حجم الملف بالبايت';
COMMENT ON COLUMN files.telegram_file_id IS 'معرف الملف في تيليجرام';
COMMENT ON COLUMN files.telegram_url IS 'رابط الملف في تيليجرام';
COMMENT ON COLUMN files.message_id IS 'معرف الرسالة في تيليجرام (للحذف)';
COMMENT ON COLUMN files.chat_id IS 'معرف القناة أو المحادثة';
COMMENT ON COLUMN files.mime_type IS 'نوع MIME للملف';
COMMENT ON COLUMN files.created_at IS 'تاريخ ووقت الرفع';
COMMENT ON COLUMN files.updated_at IS 'تاريخ ووقت آخر تحديث';
