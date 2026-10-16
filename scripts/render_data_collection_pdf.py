#!/usr/bin/env python3
"""Render the public Markdown collection guide as a Korean A4 PDF."""
from pathlib import Path
import re
from xml.sax.saxutils import escape
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import SimpleDocTemplate, Paragraph, Table, TableStyle, Spacer, PageBreak

ROOT=Path(__file__).resolve().parents[1]
SOURCE=ROOT/'docs'/'data-collection-guide-20261016.md'
DEST=ROOT/'docs'/'policyfundfinder-data-collection-20261016.pdf'
FONT='/usr/share/fonts/truetype/nanum'
pdfmetrics.registerFont(TTFont('NanumGothic', FONT+'/NanumGothic.ttf'))
pdfmetrics.registerFont(TTFont('NanumBold', FONT+'/NanumGothicBold.ttf'))
DARK=colors.HexColor('#193641')
PALE=colors.HexColor('#f2f8f7')
MUTED=colors.HexColor('#526c70')
WIDTH=A4[0]-94
ST={
 'title':ParagraphStyle('title',fontName='NanumBold',fontSize=23,leading=35,spaceAfter=25,textColor=DARK),
 'h1':ParagraphStyle('h1',fontName='NanumBold',fontSize=15,leading=22,spaceBefore=8,spaceAfter=13,keepWithNext=True,textColor=DARK),
 'p':ParagraphStyle('p',fontName='NanumGothic',fontSize=9,leading=16,spaceAfter=10,textColor=DARK,wordWrap='CJK'),
 'th':ParagraphStyle('th',fontName='NanumBold',fontSize=7.8,leading=13,textColor=colors.white,wordWrap='CJK'),
 'td':ParagraphStyle('td',fontName='NanumGothic',fontSize=7.8,leading=13.3,textColor=DARK,wordWrap='CJK'),
}
def fmt(text):
    txt=escape(text.strip())
    txt=re.sub(r'\*\*(.*?)\*\*',r'<b>\1</b>',txt)
    return txt

def para(value,kind='p'):
    return Paragraph(fmt(value),ST[kind])

def footer(canvas,doc):
    canvas.saveState()
    if doc.page>1:
        canvas.setFillColor(DARK)
        canvas.setFont('NanumBold',8.3)
        canvas.drawString(47,A4[1]-34,'지원한눈 | 데이터 수집·정리 기술 보고서')
        canvas.setStrokeColor(colors.HexColor('#dbe7e4'))
        canvas.line(47,A4[1]-41,A4[0]-47,A4[1]-41)
        canvas.line(47,37,A4[0]-47,37)
        canvas.setFillColor(MUTED)
        canvas.setFont('NanumGothic',7.8)
        canvas.drawString(47,24,'2026-10-16 스냅샷  |  원천: GitHub 및 운영 manifest')
        canvas.drawRightString(A4[0]-47,24,f'{doc.page:02}')
    canvas.restoreState()

lines=SOURCE.read_text(encoding='utf-8').splitlines()
flow=[]
i=0
while i<len(lines):
    line=lines[i].strip()
    if not line:
        i+=1;continue
    if line.startswith('# '):
        flow.extend([Spacer(1,70),para(line[2:],'title')])
    elif line.startswith('## '):
        flow.append(PageBreak())
        flow.append(para(line[3:],'h1'))
    elif line.startswith('|'):
        rows=[]
        while i<len(lines) and lines[i].strip().startswith('|'):
            cells=[x.strip() for x in lines[i].strip().strip('|').split('|')]
            if not all(re.fullmatch(r':?-{3,}:?',x) for x in cells):
                rows.append(cells)
            i+=1
        i-=1
        if rows:
            count=len(rows[0]);sizes=[WIDTH/count]*count
            if count==3:sizes=[WIDTH*.27,WIDTH*.35,WIDTH*.38]
            if count==2:sizes=[WIDTH*.39,WIDTH*.61]
            data=[[para(row[j] if j<len(row) else '', 'th' if ix==0 else 'td') for j in range(count)] for ix,row in enumerate(rows)]
            table=Table(data,colWidths=sizes,repeatRows=1,splitByRow=1,hAlign='LEFT')
            table.setStyle(TableStyle([
                ('BACKGROUND',(0,0),(-1,0),DARK),('VALIGN',(0,0),(-1,-1),'TOP'),
                ('ROWBACKGROUNDS',(0,1),(-1,-1),[colors.white,PALE]),
                ('LINEBELOW',(0,0),(-1,-1),.4,colors.HexColor('#dae7e6')),
                ('LEFTPADDING',(0,0),(-1,-1),8),('RIGHTPADDING',(0,0),(-1,-1),8),
                ('TOPPADDING',(0,0),(-1,-1),7),('BOTTOMPADDING',(0,0),(-1,-1),7),
            ]))
            flow.extend([table,Spacer(1,9)])
    else:
        flow.append(para(line))
    i+=1

DEST.parent.mkdir(parents=True,exist_ok=True)
doc=SimpleDocTemplate(str(DEST),pagesize=A4,leftMargin=47,rightMargin=47,topMargin=60,bottomMargin=50,
                     title='지원한눈 데이터 수집·정리 기술 보고서',author='지원한눈 프로젝트')
doc.build(flow,onFirstPage=footer,onLaterPages=footer)
print('PDF generated:',DEST,DEST.stat().st_size,'bytes')
