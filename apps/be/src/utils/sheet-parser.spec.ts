import { parseSheetCsv, normalizeGoogleSheetExportUrl } from './sheet-parser';

const DEFAULT_FIELDS = [
  {
    code: 'OWNER_MISMATCH',
    label: 'Sai Lệch Thông Tin CSH',
    sheetAlias: 'SAI LỆCH THÔNG TIN',
  },
  {
    code: 'OUT_OF_LIST_GCN',
    label: 'GCN Ngoài Danh Sách',
    sheetAlias: 'NGOÀI DANH SÁCH',
  },
  {
    code: 'STANDARDIZED_MAP_SHEETS',
    label: 'Số lượng tờ bản đồ đã chuẩn hóa',
    sheetAlias: 'TỜ BẢN ĐỒ ĐÃ CHUẨN HÓA',
  },
];

const SAMPLE_SHEET_CSV = `BÁO CÁO THỐNG KÊ SỔ VÀ SỐ THỬA,,,,,,
STT,LOẠI DỮ LIỆU,NGÀY THỰC HIỆN,XÃ,NGƯỜI LÀM,SỐ SỔ,SỐ THỬA
1,BA HUYỆN CŨ,18/10/2026,,Dương,108,718
2,BA HUYỆN CŨ,18/10/2026,,Thủy,88,485
3,NGOÀI DANH SÁCH,18/10/2026,,,2,20
4,NGOÀI DANH SÁCH,18/10/2026,,Hiền,440,467
5,NGOÀI DANH SÁCH,18/10/2026,,Huy,252,319
6,NGOÀI DANH SÁCH,18/10/2026,,Hương,273,"1,383"
7,NGOÀI DANH SÁCH,18/10/2026,,Khanh,107,154
8,NGOÀI DANH SÁCH,18/10/2026,,Như,702,"2,065"
9,NGOÀI DANH SÁCH,18/10/2026,,Thư,323,416
10,NGOÀI DANH SÁCH,18/10/2026,,Tùng Anh,169,772
11,SAI LỆCH THÔNG TIN,18/10/2026,Độc Lập,Khanh,132,"1,032"
12,SAI LỆCH THÔNG TIN,18/10/2026,Quang Trung,An,91,310
,TỔNG CỘNG,,,,"2,687","8,141"`;

describe('parseSheetCsv', () => {
  it('ignores retired fields, skips TỔNG CỘNG, drops NGƯỜI LÀM, and aggregates supported fields', () => {
    const rows = parseSheetCsv(SAMPLE_SHEET_CSV, DEFAULT_FIELDS);

    expect(rows).toEqual([
      {
        reportDate: '2026-10-18',
        fieldCode: 'OUT_OF_LIST_GCN',
        commune: '',
        bookCount: 2268,
        parcelCount: 5596,
      },
      {
        reportDate: '2026-10-18',
        fieldCode: 'OWNER_MISMATCH',
        commune: 'Độc Lập',
        bookCount: 132,
        parcelCount: 1032,
      },
      {
        reportDate: '2026-10-18',
        fieldCode: 'OWNER_MISMATCH',
        commune: 'Quang Trung',
        bookCount: 91,
        parcelCount: 310,
      },
    ]);

    const totalBooks = rows.reduce((sum, r) => sum + r.bookCount, 0);
    const totalParcels = rows.reduce((sum, r) => sum + r.parcelCount, 0);
    expect(totalBooks).toBe(2491);
    expect(totalParcels).toBe(6938);
  });

  it('matches custom dynamic FieldDefinition aliases or labels', () => {
    const customCsv = `STT,LOẠI DỮ LIỆU,NGÀY THỰC HIỆN,XÃ,NGƯỜI LÀM,SỐ SỔ,SỐ THỬA
1,TỜ BẢN ĐỒ ĐÃ CHUẨN HÓA,23/10/2026,Trà Lĩnh,Minh,15,420`;
    const rows = parseSheetCsv(customCsv, DEFAULT_FIELDS);
    expect(rows).toEqual([
      {
        reportDate: '2026-10-23',
        fieldCode: 'STANDARDIZED_MAP_SHEETS',
        commune: 'Trà Lĩnh',
        bookCount: 15,
        parcelCount: 420,
      },
    ]);
  });

  it('normalizes Google Sheets edit links to CSV export URLs', () => {
    const editUrl =
      'https://docs.google.com/spreadsheets/d/16WlVI8xzoxudlmCW7hiMsnynFEr1dNhXuPUBW4XmvzY/edit?gid=982199452#gid=982199452';
    expect(normalizeGoogleSheetExportUrl(editUrl)).toBe(
      'https://docs.google.com/spreadsheets/d/16WlVI8xzoxudlmCW7hiMsnynFEr1dNhXuPUBW4XmvzY/export?format=csv&gid=982199452',
    );
  });
});
