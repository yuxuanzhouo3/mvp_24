import Foundation
import StoreKit

@objc class IAPManager: NSObject {
    @objc static let shared = IAPManager()

    private func appBundleIdentifier() -> String {
        Bundle.main.bundleIdentifier ?? "(unknown)"
    }

    @available(iOS 15.0, *)
    private func fetchProductsDebugStoreKit1(productId: String) async -> (productsCount: Int, invalidIds: [String]) {
        await withCheckedContinuation { continuation in
            let delegate = ProductsRequestDelegate(productId: productId) { productsCount, invalidIds in
                continuation.resume(returning: (productsCount, invalidIds))
            }

            // Keep the delegate alive for the duration of the request.
            objc_setAssociatedObject(delegate.request, Unmanaged.passUnretained(delegate.request).toOpaque(), delegate, .OBJC_ASSOCIATION_RETAIN_NONATOMIC)
            delegate.request.start()
        }
    }

    @objc func purchase(productId: String, callback: @escaping (NSDictionary) -> Void) {
        Task {
            if #available(iOS 15.0, *) {
                do {
                    let products = try await Product.products(for: [productId])
                    guard let product = products.first else {
                        let debug = await fetchProductsDebugStoreKit1(productId: productId)
                        callback([
                            "status": "fail",
                            "message": "Product not found",
                            "productId": productId,
                            "bundleId": appBundleIdentifier(),
                            "storekit2ProductsCount": products.count,
                            "storekit1ProductsCount": debug.productsCount,
                            "invalidProductIdentifiers": debug.invalidIds
                        ])
                        return
                    }

                    let result = try await product.purchase()
                    switch result {
                    case .success(let verification):
                        switch verification {
                        case .verified(let transaction):
                            let transactionId = String(transaction.id)
                            await transaction.finish()
                            callback([
                                "status": "success",
                                "transactionId": transactionId,
                                "productId": productId
                            ])
                        case .unverified(_, let error):
                            callback(["status": "fail", "message": error.localizedDescription, "productId": productId])
                        }
                    case .userCancelled:
                        callback(["status": "cancel", "message": "User cancelled", "productId": productId])
                    case .pending:
                        callback(["status": "pending", "message": "Purchase pending", "productId": productId])
                    @unknown default:
                        callback(["status": "fail", "message": "Unknown purchase result", "productId": productId])
                    }
                } catch {
                    callback([
                        "status": "fail",
                        "message": error.localizedDescription,
                        "productId": productId,
                        "bundleId": appBundleIdentifier()
                    ])
                }
            } else {
                callback(["status": "fail", "message": "iOS 15+ required", "productId": productId])
            }
        }
    }
}

@available(iOS 15.0, *)
private final class ProductsRequestDelegate: NSObject, SKProductsRequestDelegate {
    let request: SKProductsRequest
    private let completion: (Int, [String]) -> Void

    init(productId: String, completion: @escaping (Int, [String]) -> Void) {
        self.request = SKProductsRequest(productIdentifiers: [productId])
        self.completion = completion
        super.init()
        self.request.delegate = self
    }

    func productsRequest(_ request: SKProductsRequest, didReceive response: SKProductsResponse) {
        completion(response.products.count, response.invalidProductIdentifiers)
        cleanup(request)
    }

    func request(_ request: SKRequest, didFailWithError error: Error) {
        completion(0, [])
        cleanup(request)
    }

    func requestDidFinish(_ request: SKRequest) {
        // If didReceive wasn't called, ensure we still clean up.
        cleanup(request)
    }

    private func cleanup(_ request: SKRequest) {
        // Drop the associated object to break retain cycles.
        objc_setAssociatedObject(request, Unmanaged.passUnretained(request).toOpaque(), nil, .OBJC_ASSOCIATION_RETAIN_NONATOMIC)
    }
}
