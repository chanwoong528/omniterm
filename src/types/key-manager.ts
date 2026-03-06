/** 키 매니저에 등록된 프라이빗 키 메타데이터 (평문 키는 저장하지 않음) */
export interface RegisteredKeyMeta {
  id: string;
  label: string;
  /** 저장소에 보관된 경로 또는 식별자 (Rust Store에서 조회용) */
  storageKey: string;
  /** 파일 확장자/타입 표시용 (예: .pem, id_rsa) */
  keyType: string;
  createdAt: string;
}
