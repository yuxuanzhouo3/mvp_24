"use client";

import { useLanguage } from "@/components/language-provider";
import { useTranslations } from "@/lib/i18n";

export default function SupportPage() {
  const { language } = useLanguage();
  const t = useTranslations(language);

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-3xl font-bold text-gray-900">{t.support.title}</h1>
          <p className="mt-2 text-gray-600">
            {t.support.subtitle}
          </p>
        </div>

        {/* Contact Information */}
        <div className="bg-white rounded-lg shadow-sm p-6 mb-8">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">{t.support.contact}</h2>
          <p className="text-gray-700">
            <strong>{t.support.email}:</strong>{" "}
            <a
              href="mailto:mornscience@gmail.com"
              className="text-blue-600 hover:text-blue-800"
            >
              mornscience@gmail.com
            </a>
          </p>
        </div>

        {/* FAQ */}
        <div className="bg-white rounded-lg shadow-sm p-6 mb-8">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">{t.support.faq}</h2>
          <div className="space-y-4">
            <div>
              <h3 className="font-medium text-gray-900">{t.support.questions.resetPassword.q}</h3>
              <p className="text-gray-700 mt-1">
                {t.support.questions.resetPassword.a}
              </p>
            </div>
            <div>
              <h3 className="font-medium text-gray-900">{t.support.questions.noInternet.q}</h3>
              <p className="text-gray-700 mt-1">
                {t.support.questions.noInternet.a}
              </p>
            </div>
            <div>
              <h3 className="font-medium text-gray-900">{t.support.questions.update.q}</h3>
              <p className="text-gray-700 mt-1">
                {t.support.questions.update.a}
              </p>
            </div>
            <div>
              <h3 className="font-medium text-gray-900">{t.support.questions.bugReport.q}</h3>
              <p className="text-gray-700 mt-1">
                {t.support.questions.bugReport.a}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}