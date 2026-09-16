import type { Metadata } from "next";
import Link from "next/link";
import "../../_design/tokens.css";
import s from "../../_screens/screens.module.css";
import { LegalNav, LegalPageNotice, NeedsInput } from "../_shared";

export const metadata: Metadata = { title: "プライバシーポリシー" };

export default function PrivacyPage() {
  return (
    <main className="doc">
      <div className={s.wrap}>
        <LegalNav current="privacy" />
        <h1 className={s.h1}>プライバシーポリシー</h1>
        <LegalPageNotice />

        <p className={s.body}>
          獨歩文化株式会社（以下「当社」）は、「退去費用チェック」その他の関連サービス（以下「本サービス」）
          における利用者の情報の取り扱いについて、以下のとおりプライバシーポリシーを定めます。
        </p>

        <h2 className={s.h2}>1. 取得する情報</h2>
        <ul>
          <li className={s.body}>診断のために入力・アップロードいただく契約書・精算書の内容（テキスト、またはPDFから抽出したテキスト）</li>
          <li className={s.body}>診断結果（判定内容、交渉文面の下書き）</li>
          <li className={s.body}>有償サービスをお申し込みの場合、Shopifyのチェックアウトを通じて当社が受け取る、注文番号・お支払い金額・メールアドレス</li>
        </ul>
        <p className={s.body}>
          本サービスはアカウント登録を必要としないため、氏名・住所等の会員情報は保有しません。交渉文面に宛先・
          差出人名を入力する機能をご利用の場合でも、その内容はお使いの端末（ブラウザ）内で処理され、当社のサーバー
          には送信・保存されません。
        </p>

        <h2 className={s.h2}>2. 利用目的</h2>
        <ul>
          <li className={s.body}>ご入力いただいた内容に基づく診断結果の算出・表示のため</li>
          <li className={s.body}>有償サービスのお支払いの確認、診断結果ページへのリンクの送付のため</li>
          <li className={s.body}>お問い合わせへの対応のため</li>
        </ul>

        <h2 className={s.h2}>3. 決済代行および外部サービスの利用（Shopifyについて）</h2>
        <p className={s.body}>
          本サービスの有償お申し込みの決済は、Shopify Inc.（以下「Shopify」）が提供するチェックアウトを通じて
          行われます。決済にあたり入力されるクレジットカード情報等の決済情報は、当社のサーバーを経由せず、
          Shopifyおよびその決済処理パートナーによって直接処理されます。当社はShopifyから、注文が完了した旨の
          通知（注文番号、お支払い金額、メールアドレス等）を受け取り、これを診断結果への案内送付のために利用
          します。Shopifyにおける情報の取り扱いについては、Shopifyのプライバシーポリシーをご確認ください。
        </p>
        <p className={s.body}>
          このほか、本サービスは以下の外部サービスを利用しています。
        </p>
        <ul>
          <li className={s.body}>診断結果ページへのリンクをお送りするメール配信のため：Resend</li>
          <li className={s.body}>診断結果データの保存のため：Supabase（データベース。サービス側のサーバーからのみアクセス可能で、外部への公開設定は行っていません）</li>
        </ul>

        <h2 className={s.h2}>4. 保存期間（90日での自動削除）</h2>
        <p className={s.body}>
          入力いただいた契約書・精算書の内容、および診断結果は、診断の作成日または（お支払いいただいた場合は）
          お支払いの確認日のいずれか遅い日から<strong>90日を経過した時点で自動的に削除</strong>されます。
          削除後は当社側でも内容を復元することはできません。診断結果を長期に保存したい場合は、期間内に
          PDFとして保存いただくか、印刷・スクリーンショット等で控えてください。
        </p>

        <h2 className={s.h2}>5. Cookie等の利用</h2>
        <p className={s.body}>
          本サービスは、現時点で独自の解析用・広告用Cookieを使用していません。ただし、決済処理のためにShopifyの
          チェックアウトページに遷移した際、Shopify側でCookieが使用される場合があります。
        </p>

        <h2 className={s.h2}>6. 安全管理措置</h2>
        <p className={s.body}>
          診断結果データへのアクセスは、発行される推測困難なURL（診断ごとに割り当てられるID）を知る方のみに
          限られます。データベースへのアクセスは、サービスのサーバーからのみ許可されており、外部から直接
          読み書きできない設定になっています。
        </p>

        <h2 className={s.h2}>7. 開示・削除等のご請求</h2>
        <p className={s.body}>
          ご自身が入力された情報の開示・削除等をご希望の場合は、診断結果ページのURLをご提示のうえ、
          <Link href="/taikyo/legal/tokushoho">特定商取引法に基づく表記</Link>に記載の連絡先までご連絡ください。
          本人確認のため、当該URLをお持ちであることをもって確認とさせていただく場合があります。
        </p>

        <h2 className={s.h2}>8. 本ポリシーの変更</h2>
        <p className={s.body}>
          当社は、必要と判断した場合、本ポリシーの内容を変更することがあります。変更後の内容は、本ページに
          掲載した時点から効力を生じます。
        </p>

        <h2 className={s.h2}>9. お問い合わせ窓口</h2>
        <p className={s.body}>
          獨歩文化株式会社　<NeedsInput>問い合わせ用メールアドレス</NeedsInput>
        </p>
      </div>
    </main>
  );
}
