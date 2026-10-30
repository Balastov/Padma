import Capacitor
import QuickLook
import WebKit

private func sameOrigin(_ url: URL, _ origin: URL) -> Bool {
    url.scheme == origin.scheme && url.host == origin.host && (url.port ?? 443) == (origin.port ?? 443)
}

// Keep the website's cookie session inside WKWebView, including protected files.
class PadmaViewController: CAPBridgeViewController, WKUIDelegate {
    private weak var originalUIDelegate: WKUIDelegate?

    override func viewDidLoad() {
        super.viewDidLoad()
        guard let webView else { return }
        originalUIDelegate = webView.uiDelegate
        webView.uiDelegate = self
        webView.allowsBackForwardNavigationGestures = true

        // The website already handles the bottom inset. Keep its top below the status bar.
        let container = UIView()
        container.backgroundColor = UIColor(red: 245 / 255, green: 248 / 255, blue: 1, alpha: 1)
        view = container
        container.addSubview(webView)
        webView.translatesAutoresizingMaskIntoConstraints = false
        NSLayoutConstraint.activate([
            webView.topAnchor.constraint(equalTo: container.safeAreaLayoutGuide.topAnchor),
            webView.leadingAnchor.constraint(equalTo: container.leadingAnchor),
            webView.trailingAnchor.constraint(equalTo: container.trailingAnchor),
            webView.bottomAnchor.constraint(equalTo: container.bottomAnchor)
        ])
    }

    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration,
                 for action: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        guard let url = action.request.url, let origin = bridge?.config.serverURL else { return nil }
        guard sameOrigin(url, origin) else {
            UIApplication.shared.open(url)
            return nil
        }
        if url.path.hasPrefix("/api/files/") {
            let document = PadmaDocumentViewController(configuration: configuration, origin: origin)
            present(UINavigationController(rootViewController: document), animated: true)
            document.browser.load(action.request)
        } else {
            webView.load(action.request)
        }
        return nil
    }

    // Preserve Capacitor's native alert, confirm and prompt dialogs.
    func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String,
                 initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping () -> Void) {
        if originalUIDelegate?.webView?(webView, runJavaScriptAlertPanelWithMessage: message,
                                      initiatedByFrame: frame, completionHandler: completionHandler) == nil {
            completionHandler()
        }
    }

    func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String,
                 initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (Bool) -> Void) {
        if originalUIDelegate?.webView?(webView, runJavaScriptConfirmPanelWithMessage: message,
                                      initiatedByFrame: frame, completionHandler: completionHandler) == nil {
            completionHandler(false)
        }
    }

    func webView(_ webView: WKWebView, runJavaScriptTextInputPanelWithPrompt prompt: String,
                 defaultText: String?, initiatedByFrame frame: WKFrameInfo,
                 completionHandler: @escaping (String?) -> Void) {
        if originalUIDelegate?.webView?(webView, runJavaScriptTextInputPanelWithPrompt: prompt,
                                      defaultText: defaultText, initiatedByFrame: frame,
                                      completionHandler: completionHandler) == nil {
            completionHandler(nil)
        }
    }
}

private class PadmaDocumentViewController: UIViewController, WKNavigationDelegate,
                                          WKDownloadDelegate, QLPreviewControllerDataSource {
    let browser: WKWebView
    private let origin: URL
    private var directory: URL?
    private var file: URL?
    private weak var activeDownload: WKDownload?
    private let spinner = UIActivityIndicatorView(style: .medium)

    init(configuration: WKWebViewConfiguration, origin: URL) {
        browser = WKWebView(frame: .zero, configuration: configuration)
        self.origin = origin
        super.init(nibName: nil, bundle: nil)
        browser.navigationDelegate = self
    }

    required init?(coder: NSCoder) { fatalError("Use init(configuration:origin:)") }

    deinit {
        if let directory { try? FileManager.default.removeItem(at: directory) }
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        title = "Вложение"
        view.backgroundColor = .systemBackground
        navigationItem.leftBarButtonItem = UIBarButtonItem(title: "Закрыть", style: .plain,
                                                          target: self, action: #selector(close))
        spinner.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(spinner)
        NSLayoutConstraint.activate([
            spinner.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            spinner.centerYAnchor.constraint(equalTo: view.centerYAnchor)
        ])
        spinner.startAnimating()
    }

    @objc private func close() {
        activeDownload?.cancel { _ in }
        dismiss(animated: true)
    }

    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction,
                 decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = action.request.url, sameOrigin(url, origin), url.path.hasPrefix("/api/files/") else {
            decisionHandler(.cancel)
            showError()
            return
        }
        decisionHandler(.allow)
    }

    func webView(_ webView: WKWebView, decidePolicyFor response: WKNavigationResponse,
                 decisionHandler: @escaping (WKNavigationResponsePolicy) -> Void) {
        guard let http = response.response as? HTTPURLResponse, http.statusCode == 200 else {
            decisionHandler(.cancel)
            showError()
            return
        }
        // WKDownload carries WKWebView's HttpOnly cookies; Safari has a separate session.
        decisionHandler(.download)
    }

    func webView(_ webView: WKWebView, navigationResponse: WKNavigationResponse, didBecome download: WKDownload) {
        activeDownload = download
        download.delegate = self
    }

    func download(_ download: WKDownload, decideDestinationUsing response: URLResponse,
                  suggestedFilename: String, completionHandler: @escaping (URL?) -> Void) {
        do {
            let folder = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
            try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
            directory = folder
            let name = (suggestedFilename as NSString).lastPathComponent
            let destination = folder.appendingPathComponent(name.isEmpty || name == "." || name == ".." ? "Вложение" : name)
            file = destination
            completionHandler(destination)
        } catch {
            completionHandler(nil)
            showError()
        }
    }

    func downloadDidFinish(_ download: WKDownload) {
        spinner.stopAnimating()
        let preview = QLPreviewController()
        preview.dataSource = self
        navigationController?.pushViewController(preview, animated: true)
    }

    func download(_ download: WKDownload, didFailWithError error: Error, resumeData: Data?) {
        if (error as NSError).code != NSURLErrorCancelled { showError() }
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        if (error as NSError).code != NSURLErrorCancelled { showError() }
    }

    func numberOfPreviewItems(in controller: QLPreviewController) -> Int { file == nil ? 0 : 1 }

    func previewController(_ controller: QLPreviewController, previewItemAt index: Int) -> QLPreviewItem {
        file! as NSURL
    }

    private func showError() {
        guard presentedViewController == nil else { return }
        spinner.stopAnimating()
        let alert = UIAlertController(title: "Не удалось открыть файл",
                                      message: "Проверьте подключение к интернету и доступ к вложению.", preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "Закрыть", style: .default) { [weak self] _ in self?.close() })
        present(alert, animated: true)
    }
}
