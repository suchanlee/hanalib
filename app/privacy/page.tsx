import type { Metadata } from 'next';
import { LegalPage } from '../legal-page';

export const metadata: Metadata = {
  title: '개인정보 처리방침 · Privacy Policy · Hana Seed Books',
  description: 'How Hana Seed Books handles member and circulation data.',
};

const sections = [
  {
    title: '1. What we collect · 수집하는 정보',
    paragraphs: [
      'Kakao sign-in provides your service-specific account identifier and nickname. We request only these basic sign-in details and do not require your Kakao Account email. 카카오 로그인에서 서비스별 계정 식별자와 닉네임만 받으며 카카오계정 이메일은 요구하지 않습니다.',
      'We also store the profile details you choose to provide, optional phone and verification status, book listings and cover images, borrow requests, loan and return history, notification delivery status, and minimal security and operational records. 선택한 프로필 정보, 선택적 전화번호와 인증 상태, 도서와 표지, 대여 요청·대여·반납 기록, 알림 전송 상태 및 최소한의 보안·운영 기록도 저장합니다.',
    ],
  },
  {
    title: '2. How we use it · 이용 목적',
    paragraphs: [
      'We use this information to authenticate members, show the community catalog, attribute books to their owners, coordinate borrowing and returns, send requested email or text notifications, prevent misuse, and support the service. 회원 인증, 도서 목록 제공, 소유자 표시, 대여와 반납 조율, 요청된 이메일·문자 알림, 오용 방지 및 서비스 지원에 정보를 사용합니다.',
      'We do not sell personal information or use it for behavioral advertising. 개인정보를 판매하거나 맞춤형 광고에 사용하지 않습니다.',
    ],
  },
  {
    title: '3. Community visibility · 커뮤니티 내 공개',
    paragraphs: [
      'Signed-in active members can see member display names, listed books, and ownership. People involved in a borrow request can see the information needed to arrange that loan. 로그인한 활성 회원은 표시 이름, 등록 도서와 소유자를 볼 수 있으며, 대여 당사자는 대여 조율에 필요한 정보를 볼 수 있습니다.',
      'Please do not place private information in book descriptions or other shared fields. 도서 설명 등 공유 필드에 민감한 개인정보를 입력하지 마세요.',
    ],
  },
  {
    title: '4. Service providers · 서비스 제공업체',
    paragraphs: [
      'We use providers that help operate the library, including OpenAI Sites and Cloudflare for hosting and storage, Kakao for sign-in, book-metadata sources such as Google Books and the National Library of Korea, and configured notification providers. Each receives only the information needed for its task. 호스팅·저장, 카카오 로그인, 도서 정보 조회와 알림 전송을 위해 필요한 범위에서 관련 제공업체를 사용합니다.',
    ],
  },
  {
    title: '5. Retention and security · 보관과 보안',
    paragraphs: [
      'We retain records while needed to operate the community, resolve active loans, meet security obligations, or respond to disputes. Sensitive contact details are protected in storage, and access checks are enforced on the server. 커뮤니티 운영, 진행 중인 대여, 보안 의무와 분쟁 대응에 필요한 기간 동안 기록을 보관하며 민감한 연락처는 보호해 저장하고 서버에서 접근 권한을 확인합니다.',
      'No online service can guarantee absolute security. Please contact us promptly if you believe your account or data has been misused. 어떤 온라인 서비스도 완전한 보안을 보장할 수 없으므로 계정이나 정보의 오용이 의심되면 즉시 알려 주세요.',
    ],
  },
  {
    title: '6. Your choices and contact · 권리와 문의',
    paragraphs: [
      'You may update your profile in the app and ask us to access, correct, or delete your personal information, subject to records we must retain for active loans, security, or legal obligations. 앱에서 프로필을 수정할 수 있으며, 진행 중인 대여·보안·법적 의무에 필요한 기록을 제외하고 개인정보 열람·정정·삭제를 요청할 수 있습니다.',
      'For privacy questions or requests, email lee.suchan@gmail.com. 개인정보 관련 문의나 요청은 lee.suchan@gmail.com으로 보내 주세요.',
    ],
  },
] as const;

export default function PrivacyPage() {
  return (
    <LegalPage
      eyebrow="Privacy · 개인정보"
      intro="This policy explains the information Hana Seed Books handles and the choices available to members. 씨앗책장이 처리하는 정보와 회원의 선택권을 안내합니다."
      sections={sections}
      title="Privacy Policy · 개인정보 처리방침"
    />
  );
}
