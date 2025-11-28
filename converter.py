import sys
import os
import subprocess
import json
from docx import Document
from openpyxl import Workbook
from fpdf import FPDF

# ═══════════════════════════════════════════════════════
# دوال مساعدة للتحويل
# ═══════════════════════════════════════════════════════

def convert_markdown_to_docx(markdown_content, output_path):
    """تحويل Markdown إلى DOCX باستخدام pandoc."""
    try:
        # كتابة المحتوى في ملف مؤقت
        temp_md_path = "/tmp/temp_quiz.md"
        with open(temp_md_path, "w", encoding="utf-8") as f:
            f.write(markdown_content)
        
        # استخدام pandoc للتحويل
        subprocess.run(
            ["pandoc", temp_md_path, "-o", output_path],
            check=True,
            capture_output=True,
            text=True
        )
        return True
    except subprocess.CalledProcessError as e:
        print(f"Pandoc Error (DOCX): {e.stderr}", file=sys.stderr)
        return False
    except Exception as e:
        print(f"Error (DOCX): {e}", file=sys.stderr)
        return False

def convert_markdown_to_pdf(markdown_content, output_path):
    """تحويل Markdown إلى PDF باستخدام pandoc (يفضل استخدام LaTeX engine)."""
    try:
        # كتابة المحتوى في ملف مؤقت
        temp_md_path = "/tmp/temp_quiz.md"
        with open(temp_md_path, "w", encoding="utf-8") as f:
            f.write(markdown_content)
        
        # استخدام pandoc للتحويل إلى PDF (يتطلب تثبيت LaTeX مثل texlive)
        # بما أن تثبيت LaTeX صعب في البيئة، سنستخدم طريقة أبسط وهي التحويل إلى HTML ثم PDF
        # أو الاعتماد على pandoc فقط مع افتراض وجود محرك PDF
        
        # محاولة التحويل المباشر بـ pandoc
        subprocess.run(
            ["pandoc", temp_md_path, "-o", output_path],
            check=True,
            capture_output=True,
            text=True
        )
        return True
    except subprocess.CalledProcessError as e:
        # إذا فشل pandoc في إنشاء PDF (عادة بسبب عدم وجود LaTeX)، نستخدم fpdf2 كخيار احتياطي
        print(f"Pandoc PDF failed, falling back to fpdf2: {e.stderr}", file=sys.stderr)
        return convert_markdown_to_pdf_fpdf(markdown_content, output_path)
    except Exception as e:
        print(f"Error (PDF): {e}", file=sys.stderr)
        return False

def convert_markdown_to_pdf_fpdf(markdown_content, output_path):
    """تحويل Markdown إلى PDF باستخدام fpdf2 (للنصوص البسيطة)."""
    try:
        pdf = FPDF()
        pdf.add_page()
        pdf.set_font("Arial", size=12)
        
        # يجب أن نستخدم خط يدعم اللغة العربية، لكن لتبسيط العملية سنستخدم خط افتراضي
        # في بيئة الإنتاج، يجب استخدام خط يدعم العربية مثل DejaVuSans
        
        # تقسيم المحتوى إلى أسطر
        for line in markdown_content.split('\n'):
            # محاولة إزالة تنسيقات Markdown الأساسية
            clean_line = line.replace('**', '').replace('*', '').replace('#', '').strip()
            if clean_line:
                pdf.cell(0, 10, txt=clean_line, ln=1, align='R') # align='R' للمحاذاة اليمين
        
        pdf.output(output_path)
        return True
    except Exception as e:
        print(f"Error (fpdf2 PDF): {e}", file=sys.stderr)
        return False

def convert_markdown_to_xlsx(markdown_content, output_path):
    """تحويل Markdown إلى Excel (XLSX) عن طريق تقسيم الأسطر."""
    try:
        wb = Workbook()
        ws = wb.active
        
        # تقسيم المحتوى إلى أسطر وإدخال كل سطر في خلية
        for i, line in enumerate(markdown_content.split('\n')):
            ws.cell(row=i+1, column=1, value=line)
            
        wb.save(output_path)
        return True
    except Exception as e:
        print(f"Error (XLSX): {e}", file=sys.stderr)
        return False

def convert_markdown_to_pptx(markdown_content, output_path):
    """تحويل Markdown إلى PPTX باستخدام pandoc."""
    try:
        # كتابة المحتوى في ملف مؤقت
        temp_md_path = "/tmp/temp_quiz.md"
        with open(temp_md_path, "w", encoding="utf-8") as f:
            f.write(markdown_content)
        
        # استخدام pandoc للتحويل
        subprocess.run(
            ["pandoc", temp_md_path, "-o", output_path],
            check=True,
            capture_output=True,
            text=True
        )
        return True
    except subprocess.CalledProcessError as e:
        print(f"Pandoc Error (PPTX): {e.stderr}", file=sys.stderr)
        return False
    except Exception as e:
        print(f"Error (PPTX): {e}", file=sys.stderr)
        return False

# ═══════════════════════════════════════════════════════
# الدالة الرئيسية
# ═══════════════════════════════════════════════════════

def main():
    """
    الدالة الرئيسية التي تستقبل المسارات والصيغة من سطر الأوامر.
    """
    if len(sys.argv) != 4:
        print("Usage: python3 converter.py <input_md_path> <output_path> <format>", file=sys.stderr)
        sys.exit(1)

    input_md_path = sys.argv[1]
    output_path = sys.argv[2]
    output_format = sys.argv[3].lower()

    try:
        with open(input_md_path, "r", encoding="utf-8") as f:
            markdown_content = f.read()
    except Exception as e:
        print(f"Error reading input file: {e}", file=sys.stderr)
        sys.exit(1)

    success = False
    
    if output_format == 'docx':
        success = convert_markdown_to_docx(markdown_content, output_path)
    elif output_format == 'pdf':
        success = convert_markdown_to_pdf(markdown_content, output_path)
    elif output_format == 'xlsx':
        success = convert_markdown_to_xlsx(markdown_content, output_path)
    elif output_format == 'pptx':
        success = convert_markdown_to_pptx(markdown_content, output_path)
    elif output_format == 'txt':
        # التحويل إلى TXT هو ببساطة حفظ المحتوى
        try:
            with open(output_path, "w", encoding="utf-8") as f:
                f.write(markdown_content)
            success = True
        except Exception as e:
            print(f"Error writing TXT file: {e}", file=sys.stderr)
            success = False
    elif output_format == 'md':
        # التحويل إلى MD هو ببساطة نسخ المحتوى
        try:
            with open(output_path, "w", encoding="utf-8") as f:
                f.write(markdown_content)
            success = True
        except Exception as e:
            print(f"Error writing MD file: {e}", file=sys.stderr)
            success = False
    else:
        print(f"Unsupported format: {output_format}", file=sys.stderr)
        sys.exit(1)

    if success:
        print(f"Conversion to {output_format.upper()} successful at {output_path}")
        sys.exit(0)
    else:
        print(f"Conversion to {output_format.upper()} failed", file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main()
