/** 이미지 리디자인 파라미터 */
export interface RedesignImageParams {
    inputPath: string;
    outputPath: string;
    titleKo: string;
    bulletsKo: string[];
}
/**
 * 이미지에 한국어 텍스트 박스 삽입 (Pillow)
 * @returns 성공 시 outputPath, 실패 시 null (degrade)
 */
export declare function redesignImage(params: RedesignImageParams): Promise<string | null>;
//# sourceMappingURL=image-redesign.d.ts.map