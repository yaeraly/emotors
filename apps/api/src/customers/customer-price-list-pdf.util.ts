import { createWriteStream } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import PDFDocument from 'pdfkit';
import type { SafeCustomerPriceListDto } from './customer-price-list.util';

function resolveFontPath(fileName: string) {
  return join(process.cwd(), 'assets', 'fonts', fileName);
}

function formatMoney(value: number, currency: string) {
  return `${value.toLocaleString('ru-RU', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} ${currency}`;
}

/**
 * Generate a customer-facing Cyrillic PDF price list.
 * Uses DejaVu fonts for full Cyrillic support.
 */
export async function writeCustomerPriceListPdf(input: {
  dto: SafeCustomerPriceListDto;
  absoluteFilePath: string;
}): Promise<{ pageCount: number }> {
  await mkdir(dirname(input.absoluteFilePath), { recursive: true });

  const regularFont = resolveFontPath('DejaVuSans.ttf');
  const boldFont = resolveFontPath('DejaVuSans-Bold.ttf');
  const doc = new PDFDocument({
    size: 'A4',
    margin: 40,
    info: {
      Title: input.dto.title,
      Author: 'EMOTORS',
      Subject: 'Customer price list',
    },
  });

  const stream = createWriteStream(input.absoluteFilePath);
  doc.pipe(stream);

  doc.registerFont('Body', regularFont);
  doc.registerFont('Heading', boldFont);

  let pageCount = 1;
  doc.on('pageAdded', () => {
    pageCount += 1;
  });

  const { dto } = input;
  const generatedAt = new Date(dto.generatedAt).toLocaleString('ru-RU');

  doc.font('Heading').fontSize(18).text('EMOTORS', { align: 'left' });
  doc.font('Body').fontSize(10).fillColor('#334155').text(dto.branchName);
  if (dto.branchPhone) doc.text(`Тел: ${dto.branchPhone}`);
  if (dto.branchAddress) doc.text(dto.branchAddress);
  doc.moveDown(0.6);

  doc.font('Heading').fontSize(14).fillColor('#0f172a').text(dto.title);
  doc.font('Body').fontSize(10).fillColor('#334155');
  doc.text(`Клиент: ${dto.customerName}`);
  doc.text(`Тип клиента: ${dto.customerTypeLabel}`);
  doc.text(`Категория: ${dto.loyaltyCategoryLabel}`);
  if (dto.loyaltyDiscountPercent > 0) {
    doc.text(`Доп. наценка: ${dto.loyaltyDiscountPercent}%`);
  }
  doc.text(`Дата формирования: ${generatedAt}`);
  doc.text(`Валюта: ${dto.currency}`);
  doc.moveDown(0.4);
  doc.fontSize(9).fillColor('#64748b').text(dto.validityNote, { width: 515 });
  doc.moveDown(0.8);

  const columns = {
    sku: 40,
    name: 110,
    category: 300,
    unit: 380,
    availability: 420,
    price: 490,
  };

  const drawHeader = () => {
    const y = doc.y;
    doc.font('Heading').fontSize(8).fillColor('#0f172a');
    doc.text('SKU', columns.sku, y, { width: 65 });
    doc.text('Товар', columns.name, y, { width: 180 });
    doc.text('Категория', columns.category, y, { width: 70 });
    doc.text('Ед.', columns.unit, y, { width: 35 });
    doc.text('Наличие', columns.availability, y, { width: 60 });
    doc.text('Цена', columns.price, y, { width: 70, align: 'right' });
    doc
      .moveTo(40, y + 12)
      .lineTo(555, y + 12)
      .strokeColor('#cbd5e1')
      .stroke();
    doc.y = y + 16;
  };

  drawHeader();

  for (const product of dto.products) {
    doc.font('Body').fontSize(8);
    const rowHeight = Math.max(28, doc.heightOfString(product.name, { width: 180 }) + 8);

    if (doc.y + rowHeight > doc.page.height - 60) {
      doc.addPage();
      drawHeader();
    }

    const y = doc.y;
    doc.font('Body').fontSize(8).fillColor('#0f172a');
    doc.text(product.sku, columns.sku, y, { width: 65 });
    doc.text(product.name, columns.name, y, { width: 180 });
    doc.text(product.category ?? '—', columns.category, y, { width: 70 });
    doc.text(product.unit ?? '—', columns.unit, y, { width: 35 });
    doc
      .fillColor(product.availabilityStatus === 'OUT_OF_STOCK' ? '#b45309' : '#047857')
      .text(product.availabilityLabel, columns.availability, y, { width: 60 });
    doc
      .fillColor('#0f172a')
      .text(formatMoney(product.customerPriceKgs, product.currency), columns.price, y, {
        width: 70,
        align: 'right',
      });
    doc.y = y + rowHeight;
  }

  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i += 1) {
    doc.switchToPage(i);
    doc
      .font('Body')
      .fontSize(8)
      .fillColor('#94a3b8')
      .text(`Страница ${i - range.start + 1} из ${range.count}`, 40, doc.page.height - 30, {
        width: 515,
        align: 'center',
      });
  }

  doc.end();

  await new Promise<void>((resolve, reject) => {
    stream.on('finish', () => resolve());
    stream.on('error', reject);
  });

  return { pageCount };
}
