import type { Metadata } from 'next';
import { LegalPage } from '../legal-page';

export const metadata: Metadata = {
  title: '이용약관 · Terms of Service · Hana Library',
  description: 'Terms for participating in Hana Community Library.',
};

const sections = [
  {
    title: '1. The service · 서비스',
    paragraphs: [
      'Hana Community Library helps members in the United States list, discover, borrow, and return books shared by their community. 하나도서관은 미국 내 커뮤니티 회원이 책을 등록하고 발견하며 빌리고 반납하도록 돕는 서비스입니다.',
      'The service coordinates introductions and records; it does not own, inspect, insure, deliver, or guarantee the condition or availability of member books. 서비스는 연결과 기록을 제공하며 회원 도서의 소유·검수·보험·배송 또는 상태와 이용 가능성을 보장하지 않습니다.',
    ],
  },
  {
    title: '2. Accounts and eligibility · 계정과 자격',
    paragraphs: [
      'Provide accurate account information, keep your sign-in account secure, and use one account for yourself. Tell us promptly about unauthorized access. 정확한 계정 정보를 제공하고 로그인 계정을 안전하게 관리하며 본인 계정만 사용해야 합니다. 무단 접근이 의심되면 즉시 알려 주세요.',
      'The service is intended for adults managing community book sharing. We do not knowingly collect personal information from children under 13 without appropriate parental consent. 본 서비스는 커뮤니티 도서 공유를 관리하는 성인을 위한 것이며 적절한 보호자 동의 없이 만 13세 미만 아동의 개인정보를 고의로 수집하지 않습니다.',
    ],
  },
  {
    title: '3. Listing and borrowing · 등록과 대여',
    paragraphs: [
      'List only books you own or are authorized to share, describe them honestly, and use cover images and metadata you are allowed to provide. 소유하거나 공유 권한이 있는 책만 정확히 등록하고 사용 권한이 있는 표지와 도서 정보만 제공해야 합니다.',
      'A borrow request remains open for 48 hours. If accepted, the borrower and owner are responsible for arranging the handoff. The app begins return checks after day 7 and repeats them weekly, and either party may record a return. 대여 요청은 48시간 동안 유효하며 수락되면 당사자가 전달을 조율합니다. 앱은 7일 후부터 매주 반납 여부를 확인하고 대여자나 소유자가 반납을 기록할 수 있습니다.',
      'Borrowers should handle books carefully and return them as agreed. Owners and borrowers are responsible for resolving loss, damage, timing, and any costs directly with each other. 대여자는 책을 소중히 다루고 합의대로 반납해야 하며 분실·손상·일정·비용은 당사자끼리 해결합니다.',
    ],
  },
  {
    title: '4. Acceptable use · 올바른 이용',
    paragraphs: [
      'Do not misuse another person’s information, impersonate others, upload unlawful or harmful content, interfere with the service, bypass access controls, send spam, or use the community for unrelated commercial activity. 타인의 정보를 오용하거나 사칭하고, 불법·유해 콘텐츠를 올리거나 서비스와 접근 통제를 방해하고, 스팸 또는 무관한 상업 활동에 이용해서는 안 됩니다.',
      'We may remove content or suspend access when reasonably needed to protect members, books, or the service. 회원과 도서 및 서비스를 보호하기 위해 필요한 경우 콘텐츠를 삭제하거나 접근을 제한할 수 있습니다.',
    ],
  },
  {
    title: '5. Availability and responsibility · 서비스 제공과 책임',
    paragraphs: [
      'The service is provided on an “as available” basis and may change or experience interruptions. To the extent permitted by law, Hana Community Library is not responsible for indirect losses or for disputes, injury, loss, or damage arising from member-to-member exchanges. 서비스는 이용 가능한 상태로 제공되며 변경되거나 중단될 수 있습니다. 법이 허용하는 범위에서 회원 간 교환에서 발생한 분쟁·상해·분실·손상 또는 간접 손실에 책임지지 않습니다.',
      'Nothing in these terms limits rights or responsibilities that cannot legally be limited. 본 약관은 법적으로 제한할 수 없는 권리나 책임을 제한하지 않습니다.',
    ],
  },
  {
    title: '6. Changes and contact · 변경과 문의',
    paragraphs: [
      'We may update these terms as the service evolves. Material changes will be communicated through the service or the contact information associated with your account. 서비스 변경에 따라 약관을 수정할 수 있으며 중요한 변경은 서비스 또는 계정 연락처로 알립니다.',
      'Questions about these terms may be sent to lee.suchan@gmail.com. 약관 관련 문의는 lee.suchan@gmail.com으로 보내 주세요.',
    ],
  },
] as const;

export default function TermsPage() {
  return (
    <LegalPage
      eyebrow="Terms · 이용약관"
      intro="These terms set expectations for using Hana Community Library and sharing books with other members. 하나도서관 이용과 회원 간 도서 공유에 필요한 기본 원칙입니다."
      sections={sections}
      title="Terms of Service · 이용약관"
    />
  );
}
