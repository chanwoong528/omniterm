import type { ImageMetadata } from 'astro';
import featureBastionImage from './assets/screenshots/feature-bastion.png';
import featureKeysImage from './assets/screenshots/feature-keys.png';
import featureMacosImage from './assets/screenshots/feature-macos.png';
import featureSessionsImage from './assets/screenshots/feature-sessions.png';
import featureSftpImage from './assets/screenshots/feature-sftp.png';
import featureTabsImage from './assets/screenshots/feature-tabs.png';

/** 캡처 배율. assets/screenshots/manifest.json의 devicePixelRatio와 같아야 한다. */
export const SCREENSHOT_DPR = 2;

/** <source>로 내보낼 형식. 앞에 둔 형식을 지원하는 브라우저가 먼저 고른다. */
export const SCREENSHOT_SOURCE_FORMATS = ['avif', 'webp'] as const;

/* <img> 대체 형식. Astro 기본값(png)은 2x 원본과 비슷한 크기의 파일을 하나 더 만들지만,
   webp를 못 읽는 브라우저(Safari 13 이하)는 사실상 없으므로 webp로 둔다. */
export const SCREENSHOT_FALLBACK_FORMAT = 'webp';

/** 창 일부를 잘라 낸 캡처에서 잘린 단면을 흐릴 가장자리. 'none'이면 그대로 둔다. */
type CroppedEdges = 'none' | 'right' | 'right-bottom';

interface FeatureScreenshot {
  image: ImageMetadata;
  croppedEdges: CroppedEdges;
}

export const featureScreenshots = {
  bastion: { image: featureBastionImage, croppedEdges: 'none' },
  tabs: { image: featureTabsImage, croppedEdges: 'none' },
  sftp: { image: featureSftpImage, croppedEdges: 'none' },
  keys: { image: featureKeysImage, croppedEdges: 'none' },
  sessions: { image: featureSessionsImage, croppedEdges: 'none' },
  macos: { image: featureMacosImage, croppedEdges: 'right-bottom' },
} satisfies Record<string, FeatureScreenshot>;

/** 잘린 가장자리를 흐리는 유틸리티 클래스(global.css의 @utility). */
export const FADE_CLASS_BY_CROPPED_EDGES: Record<CroppedEdges, string> = {
  none: '',
  right: 'fade-right-edge',
  'right-bottom': 'fade-right-bottom-edges',
};

export type FeatureScreenshotKey = keyof typeof featureScreenshots;

/* Astro는 import한 이미지 객체의 속성을 한 번이라도 읽으면 "쓰였다"고 보고 원본 PNG까지 dist에 복사한다.
   getImage()가 내부에서 하듯 clone(읽어도 표시가 남지 않는 복사본)에서 크기를 읽는다. */
function readOriginalSize(image: ImageMetadata) {
  const { width, height } = (image as ImageMetadata & { clone?: ImageMetadata }).clone ?? image;
  return { width, height };
}

/** 원본을 배율로 나눈 논리(CSS px) 크기. 이보다 크게 그리면 글자가 흐려진다. */
export function getLogicalSize(image: ImageMetadata) {
  const original = readOriginalSize(image);
  return {
    width: original.width / SCREENSHOT_DPR,
    height: original.height / SCREENSHOT_DPR,
  };
}

/** srcset 후보 너비: 1x 화면용 논리 너비와 2x 화면용 원본 너비 */
export function getSrcsetWidths(image: ImageMetadata) {
  const { width } = getLogicalSize(image);
  return [width, width * SCREENSHOT_DPR];
}
